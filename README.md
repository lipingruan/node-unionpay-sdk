# node-unionpay-sdk

银联支付 NodeJS SDK, 目前支持如下:
- [x] 在线网关支付 [frontTransReq](https://open.unionpay.com/tjweb/api/dictionary?apiSvcId=448) 
- [x] 银联响应数据及回调通知验证(证书链验证)
- [ ] 云闪付APP支付 [appTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=450&acpAPIId=765&bussType=0)
- [ ] 统一支付接口 [trans](https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=568&acpAPIId=740&bussType=1)
- [ ] 消费撤销/退款 [backTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=755&apiservId=448&version=V2.2&bussType=0)
- [ ] 交易状态查询 [queryTrans](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=757&apiservId=448&version=V2.2&bussType=0)
- [ ] 银联加密公钥更新查询 [backTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=758&apiservId=448&version=V2.2&bussType=0)

## 环境依赖
1. 目前测试 Node 14.15.1 版本正常运行
2. Windows 需要安装 openssl, [点击下载](http://slproweb.com/download/Win64OpenSSL-3_0_2.msi)

## 安装
```bash
npm install @lipingruan/node-unionpay-sdk
```

## 初始化
```javascript
const Unionpay = require ( '@lipingruan/node-unionpay-sdk' )

const unionpay = new Unionpay ( {
    sandbox: true,
    merId: '商户号',
    consumeCallbackUrl: '后台回调地址',
    certification: 'pfx证书',
    certificationPassword: 'pfx证书密码',
    unionpayRootCA: '银联根证书',
    unionpayMiddleCA: '银联中级证书',
    // 更多参数见<初始化参数列表>
} )
```

## 初始化参数列表
> 特别说明: 证书可传绝对地址或文件内容`(fs.readFileSync)`

|参数|类型|默认值|说明|
|----|----|----|----|
| sandbox | boolean | true | 是否沙箱环境 |
| version | string | 5.1.0 | 接口版本 |
| encoding | string | UTF-8 | 报文编码 |
| certification | string/buffer | null | 商户pfx证书 |
| certificationPassword | string | null | 商户证书密码 |
| unionpayRootCA | string/buffer | null | 银联根证书 |
| unionpayMiddleCA | string/buffer | null | 银联中级证书 |
| merId | string | null | 商户号 |
| consumeCallbackUrl | string | null | 后台回调地址 |
| accessType | string | 0 | [接入类型](https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=448&acpAPIId=754&bussType=0) |
| channelType | string | 07 | 渠道类型 |
| currencyCode | string | 156 | 交易货币代码 |

## 在线网关支付
```javascript
try {

    const { redirect } = await unionpay.frontTransReq ( {
        // required:string 商户订单号
        orderId: '20220307968496436', 
        // required:number 交易金额, 单位:分
        amount: 100, 
        // optional:string 交易描述
        description: '这是交易描述', 
        // optional:string 附加数据, 回调原样返回
        attach: 'a=1&b=2', 
        // optional:string 渠道类型, 07:PC/平板,09:手机
        channelType: '07', 
        // required:string 前端付款完成后跳转页面
        consumeTargetUrl: 'https://xxx.com/order?id=20220307968496436'
    } )
    // redirect 为银联付款网页链接
} catch ( error ) {
    
    console.error ( '银联下单失败:', error.message )
}
```

## 银联数据验证
```javascript
const body = { } // 银联回调数据

const verified = unionpay.getResponseVerify ( body )

console.log ( `回调验证${verified?'通过':'失败'}` )
```