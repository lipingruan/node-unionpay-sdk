
const fs = require ( 'fs' )

const crypto = require ( 'crypto' )

const IO = require ( './util/io' )

const Time = require ( './util/time' )

const openssl = require ( './util/openssl' )

const secured = Symbol ( 'secured' )



module.exports = class Unionpay {
    


    #config = {
        sandbox: true,
        version: '5.1.0',
        encoding: 'UTF-8',

        // 商户证书
        certification: '',
        // 商户证书密钥
        certificationPassword: '',

        // 商户公私钥
        publicKey: '',
        privateKey: '',

        // 银联官方证书
        unionpayRootCA: '',
        unionpayMiddleCA: '',

        // pfx证书序列号
        certId: '',

        // 商户号
        merId: '',

        // 消费后台回调地址
        consumeCallbackUrl: '',
        // 撤销订单回调地址
        cancelOrderCallbackUrl: '',
        // 退款订单回调地址
        refundOrderCallbackUrl: '',

        /**
         * 0:直连,1:服务商,2:平台商户
         * @type {string}
         */
        accessType: '0',

        /**
         * 07:PC/平板,09:手机
         * @type {string}
         */
        channelType: '07',

        /**
         * 货币类型, 156:人民币
         * @type {string}
         */
        currencyCode: '156',
    }



    constructor ( config ) {

        if ( config ) this.config = config
    }



    set config ( config ) {

        Object.assign ( this.#config, config )

        const { certification, certificationPassword, unionpayRootCA, unionpayMiddleCA } = this.#config

        if ( 'string' === typeof certification ) {

            const x509 = openssl.getX509FromPKCS12 ( certification, {
                password: certificationPassword
            } )

            const serialNumber = openssl.getSerialNumberFromX509 ( x509 )

            this.#config.certId = String ( parseInt ( serialNumber, 16 ) )

            const { key: publicKey } = openssl.getKeyFromX509 ( x509, 'publicKey', {
                returnsKey: true
            } )

            this.#config.publicKey = publicKey

            const { key: privateKey } = openssl.getKeyFromX509 ( x509, 'privateKey', {
                returnsKey: true
            } )

            this.#config.privateKey = privateKey
        }

        if ( !openssl.isCertification ( unionpayRootCA ) ) this.#config.unionpayRootCA = fs.readFileSync ( unionpayRootCA )

        if ( !openssl.isCertification ( unionpayMiddleCA ) ) this.#config.unionpayMiddleCA = fs.readFileSync ( unionpayMiddleCA )
    }



    get config ( ) { return this.#config }



    get urlPrefix ( ) {

        return this.#config.sandbox ?
            'https://gateway.test.95516.com' : 
            'https://gateway.95516.com'
    }
    


    urls = {
        [secured]: this.urlPrefix,
        get frontTransReq ( ) { return this[secured] + '/gateway/api/frontTransReq.do' },
        get appTransReq ( ) { return this[secured] + '/gateway/api/appTransReq.do' },
        get backTransReq ( ) { return this[secured] + '/gateway/api/backTransReq.do' },
        get queryTrans ( ) { return this[secured] + '/gateway/api/queryTrans.do' },
    }



    /**
     * 对象转 url 参数, ascii 排序
     * @param {*} form 
     * @returns {string}
     */
    form2Querystring ( form ) {

        let kvs = [ ]

        const keys = Object.keys ( form ).sort ( )

        const banKeys = [ 'signature' ]

        for ( const key of keys )
            if ( !banKeys.includes ( key ) && form [ key ] )
                kvs.push ( [ key, form [ key ] ].join ( '=' ) )

        return kvs.join ( '&' )
    }



    /**
     * 对象转 url 后, 再 sha256
     * @param {*} form 
     * @returns {string}
     */
    form2Hash ( form ) {

        const preString = this.form2Querystring ( form )

        const mSHA256 = crypto.createHash ( 'SHA256' )

        mSHA256.update ( preString )

        return mSHA256.digest ( 'hex' )
    }



    /**
     * 获取表单签名
     * @param {*} form 
     * @returns {string}
     */
    getFormSign ( form ) {

        const sha256 = this.form2Hash ( form )

        const signer = crypto.createSign ( 'RSA-SHA256' )

        signer.update ( sha256 )

        const sign = signer.sign ( this.#config.privateKey, 'base64' )

        return sign
    }



    /**
     * 签名和去除表单空项
     * @param {*} form 
     */
    signAndMinifyForm ( form ) {

        form.signMethod = '01'

        for ( const key of Object.keys ( form ) ) {

            const value = form [ key ]

            if ( value === '' || value === undefined || value === null )
                delete form [ key ]
            else if ( 'string' === typeof value && value.includes ( '&' ) )
                form [ key ] = encodeURIComponent ( value )
        }

        form.signature = this.getFormSign ( form )
    }



    /**
     * 获取表单签名是否正确
     * @param {*} form 
     * @param {*} publicKey 
     * @returns {boolean}
     */
    getFormVerify ( form, publicKey ) {

        const sha256 = this.form2Hash ( form )

        const verifier = crypto.createVerify ( 'RSA-SHA256' )

        verifier.update ( sha256 )

        return verifier.verify ( publicKey, Buffer.from ( form.signature, 'base64' ) )
    }


    
    /**
     * 银联响应数据验证
     * @param {*} form 
     * @returns {boolean}
     */
    getResponseVerify ( form ) {

        if ( form.merId !== this.#config.merId ) return false

        const publicKey = form.signPubKeyCert

        const signVerified = this.getFormVerify ( form, publicKey )

        if ( !signVerified ) return false

        const certChainVerified = openssl.verifySigningChain ( publicKey, [
            this.#config.unionpayRootCA,
            this.#config.unionpayMiddleCA
        ] )

        return certChainVerified
    }


    /**
     * 银联返回数据解析
     * @param {string|*} body
     * @returns {*}
     */
    responseBodyParse ( body ) {

        if ( 'string' === typeof body ) {

            const jsonBody = { }

            for ( const row of body.split ( '&' ) ) {

                const divIndex = row.indexOf ( '=' )

                const key = row.slice ( 0, divIndex )

                const val = row.slice ( divIndex + 1 )

                jsonBody [ key ] = val
            }

            return jsonBody
        }

        return body
    }



    /**
     * Web跳转网关支付
     * @see {@link https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=448&acpAPIId=754&bussType=0}
     * @param {{
     * orderId: string,
     * txnTime: string | number | Date,
     * txnAmt: number,
     * reqReserved?: *,
     * orderDesc?: string,
     * channelType?: string,
     * frontUrl?: string,
     * backUrl?: string,
     * }} form
     * @returns {Promise<{redirect:string}>}
     */
    async createWebOrder ( form ) {

        let { txnTime, reqReserved, channelType: newChannelType, ...others } = form

        const { certId, merId, encoding, version, accessType, channelType, currencyCode, consumeCallbackUrl } = this.#config

        if ( [ 'number', 'object' ].includes ( typeof txnTime ) ) txnTime =  Time.format ( txnTime, 'YYYYMMDDhhmmss' )
        
        const sendBody = {
            txnType: '01',
            txnSubType: '01',
            bizType: '000201',
            channelType: newChannelType || channelType,
            txnTime,

            // 固定参数
            certId, merId, encoding, version,
            accessType,
            currencyCode,
            backUrl: consumeCallbackUrl,

            ...others,
        }

        if ( reqReserved ) sendBody.reqReserved = 'string' === typeof reqReserved ? reqReserved : JSON.stringify ( reqReserved )

        this.signAndMinifyForm ( sendBody )

        const { body, headers } = await IO.http ( this.urls.frontTransReq, sendBody, 'form' )

        const { location } = headers

        if ( body || !location ) {

            if ( 'string' === typeof body ) {

                const errorWrapped = body.match ( /end_error\"\>.*\<\// )

                if ( errorWrapped ) {

                    const errorMessage = errorWrapped [ 0 ].slice ( 11, -2 )

                    throw new Error ( errorMessage )
                }
            }
            
            throw new Error ( '网关接口调用异常' )
        }

        return { redirect: location }
    }



    /**
     * APP跳转云闪付支付
     * @see {@link https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=765&apiservId=450&version=V2.2&bussType=0}
     * @param {{
     * orderId: string,
     * txnTime: number | Date | string,
     * txnAmt: number,
     * reqReserved?: *,
     * orderDesc?: string,
     * frontUrl?: string,
     * }} form
     * @returns {Promise<{tn:string}>}
     */
    async createAppOrder ( form ) {

        let { txnTime, reqReserved, ...others } = form

        const { certId, merId, encoding, version, accessType, currencyCode, consumeCallbackUrl } = this.#config

        if ( [ 'number', 'object' ].includes ( typeof txnTime ) ) txnTime =  Time.format ( txnTime, 'YYYYMMDDhhmmss' )
        
        const sendBody = {
            txnType: '01',
            txnSubType: '01',
            bizType: '000201',
            channelType: '08',
            txnTime,

            // 固定参数
            certId, merId, encoding, version,
            accessType,
            currencyCode,
            backUrl: consumeCallbackUrl,

            ...others,
        }

        if ( reqReserved ) sendBody.reqReserved = 'string' === typeof reqReserved ? reqReserved : JSON.stringify ( reqReserved )

        this.signAndMinifyForm ( sendBody )

        const { body: source } = await IO.http ( this.urls.appTransReq, sendBody, 'form' )

        const body = this.responseBodyParse ( source )

        const verified = this.getResponseVerify ( body )

        if ( !verified ) throw new Error ( '银联返回数据验证失败' )

        const { respCode, respMsg, tn } = body

        if ( respCode === '00' && tn ) {
            
            return { tn }
        } else {

            throw new Error ( respMsg || '银联系统错误:下单失败' )
        }
    }



    /**
     * 查询订单状态
     * @see {@link https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=450&acpAPIId=768&bussType=0}
     * @param form
     * @param {string} form.orderId 支付、撤销、退款订单号
     * @param {number|Date|string} form.txnTime 订单创建时间
     * @returns {Promise<null|{
     * body: *,
     * queryId: string,
     * status: 'PENDING'|'SUCCESS'|'FAIL'
     * }>}
     */
    async queryOrder ( form ) {

        let { txnTime, ...others } = form

        const { certId, merId, encoding, version, accessType } = this.#config

        if ( [ 'number', 'object' ].includes ( typeof txnTime ) ) txnTime =  Time.format ( txnTime, 'YYYYMMDDhhmmss' )

        const sendBody = {
            txnType: '00',
            txnSubType: '00',
            bizType: '000802',
            txnTime,

            // 固定参数
            certId, merId, encoding, version,
            accessType,

            ...others,
        }

        this.signAndMinifyForm ( sendBody )

        const { body: source } = await IO.http ( this.urls.queryTrans, sendBody, 'form' )

        const body = this.responseBodyParse ( source )

        const verified = this.getResponseVerify ( body )

        if ( !verified ) throw new Error ( '银联返回数据验证失败' )

        const { queryId, respCode, respMsg, origRespCode } = body

        if ( respCode === '00' ) {
            // 语义化状态
            let status = origRespCode === '00' ?
                'SUCCESS' :
                [ '03', '04', '05' ].includes ( origRespCode ) ?
                    'PENDING' :
                    'FAIL'

            return {
                status,
                queryId,
                body
            }
        } else if ( respCode === '34' ) {
            // 订单不存在
            throw new Error ( '银联系统错误:订单不存在' )
        } else {

            throw new Error ( respMsg || '银联系统错误:查询失败' )
        }
    }



    /**
     * 退款、撤单等对原订单进行操作下单
     * @param form
     * @param {string} form.orderId 单号，非原订单单号
     * @param {string} form.origQryId 原订单的 queryId
     * @param {number|Date|string} form.txnTime 下单时间
     * @param {number} form.txnAmt 原订单的金额
     * @param {string} form.channelType 原订单的渠道
     * @param {string} form.reqReserved 附加回调数据
     * @param {string} form.txnType 交易类型
     * @returns {Promise<*>}
     */
    async unifyOrderForOrder ( form ) {

        let { txnTime, channelType: newChannelType, reqReserved, ...others } = form

        const { certId, merId, encoding, version, accessType, channelType } = this.#config

        if ( [ 'number', 'object' ].includes ( typeof txnTime ) ) txnTime =  Time.format ( txnTime, 'YYYYMMDDhhmmss' )

        const sendBody = {
            bizType: '000201',
            txnSubType: '00',
            txnTime,
            channelType: newChannelType || channelType,

            // 固定参数
            certId, merId, encoding, version,
            accessType,

            ...others,
        }

        if ( reqReserved ) sendBody.reqReserved = 'string' === typeof reqReserved ? reqReserved : JSON.stringify ( reqReserved )

        this.signAndMinifyForm ( sendBody )

        const { body: source } = await IO.http ( this.urls.backTransReq, sendBody, 'form' )

        const body = this.responseBodyParse ( source )

        const verified = this.getResponseVerify ( body )

        if ( !verified ) throw new Error ( '银联返回数据验证失败' )

        const { respCode, respMsg } = body

        if ( [ '00', '03', '04', '05' ].includes ( respCode ) ) {

            return body
        } else {

            throw new Error ( respMsg || '银联系统错误:操作失败' )
        }
    }



    /**
     * 当天已支付订单撤销
     * @see {@link https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=448&acpAPIId=755&bussType=0#nav09}
     * @param form
     * @param {string} form.orderId '撤销订单'的单号，非支付订单
     * @param {string} form.origQryId 原支付订单的 queryId
     * @param {number|Date|string} form.txnTime 撤销时间
     * @param {number} form.txnAmt 原支付订单的金额
     * @param {string} form.channelType 原支付订单的渠道
     * @param {string} form.reqReserved 附加回调数据
     * @returns {Promise<*>}
     */
    async cancelOrder ( form ) {

        form.txnType = '31'

        if ( !form.backUrl ) form.backUrl = this.#config.cancelOrderCallbackUrl

        return await this.unifyOrderForOrder ( form )
    }



    /**
     * 退款
     * @see {@link https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=450&acpAPIId=767&bussType=0}
     * @param form
     * @param {string} form.orderId '退款订单'的单号，非支付订单
     * @param {string} form.origQryId 原支付订单的 queryId
     * @param {number|Date|string} form.txnTime 退款时间
     * @param {number} form.txnAmt 原支付订单的金额
     * @param {string} form.channelType 原支付订单的渠道
     * @param {string} form.reqReserved 附加回调数据
     * @returns {Promise<*>}
     */
    async refundOrder ( form ) {

        form.txnType = '04'

        if ( !form.backUrl ) form.backUrl = this.#config.refundOrderCallbackUrl

        return await this.unifyOrderForOrder ( form )
    }
}
