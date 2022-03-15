
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
        
        // 消费前台回调地址
        consumeTargetUrl: '',

        /**
         * @type {number} 0:直连,1:服务商,2:平台商户
         */
        accessType: '0',

        // 渠道类型
        channelType: '08',

        // 货币类型, 156: 人民币
        currencyCode: '156',

    }



    set config ( config ) {

        Object.assign ( this.config, config )
    }



    get config ( ) { return this.#config }



    get urlPrefix ( ) {

        return this.config.sandbox ? 
            'https://gateway.test.95516.com' : 
            'https://gateway.95516.com'
    }
    


    urls = {
        [secured]: this.urlPrefix,
        get frontTransReq ( ) { return this[secured] + '/gateway/api/frontTransReq.do' }
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

        const sign = signer.sign ( this.config.privateKey, 'base64' )

        return sign
    }



    /**
     * 签名和去除表单空项
     * @param {*} form 
     */
    signAndMinifyForm ( form ) {

        for ( const key of Object.keys ( form ) ) {

            const value = form [ key ]

            if ( value === '' || value === undefined || value === null )
                delete form [ key ]
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

        const publicKey = form.signPubKeyCert

        const signVerified = this.getFormVerify ( form, publicKey )

        if ( !signVerified ) return false

        const certChainVerified = openssl.verifySigningChain ( publicKey, [
            this.config.unionpayRootCA,
            this.config.unionpayMiddleCA
        ] )

        return certChainVerified
    }



    /**
     * Web跳转网关支付
     * @param {{
     * orderId: string,
     * amount: number,
     * attach: string,
     * description: string,
     * }} form 
     * @returns {Promise<{redirect:string}>}
     */
    async frontTransReq ( form ) {

        const { orderId, amount, description, attach } = form

        const { certId, merId, encoding, version, accessType, channelType, currencyCode, consumeCallbackUrl, consumeTargetUrl } = this.config

        const now = new Date

        const time = Time.format ( now, 'YYYYMMDDhhmmss' )
        
        const sendBody = {
            certId, merId, encoding, version, 
            accessType, channelType, currencyCode, 
            backUrl: consumeCallbackUrl,
            frontUrl: consumeTargetUrl,
            bizType: '000201',

            orderDesc: description,
            orderId, txnAmt: amount,
            signMethod: '01',
            txnSubType: '01',
            txnTime: time,
            txnType: '01',
        }

        if ( attach ) sendBody.reqReserved = 'string' === typeof attach ? attach : JSON.stringify ( attach )

        this.signAndMinifyForm ( sendBody )

        const { body, headers } = await IO.http ( this.urls.frontTransReq, sendBody, 'form' )

        const { location } = headers

        if ( body || !location ) throw new Error ( '网关接口调用异常' )

        return { redirect: location }
    }
}