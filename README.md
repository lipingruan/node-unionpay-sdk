# node-unionpay-sdk

银联支付/云闪付 NodeJS SDK, 目前支持如下:
- [x] 在线网关支付 [frontTransReq](https://open.unionpay.com/tjweb/api/dictionary?apiSvcId=448) 
- [x] 银联响应数据及回调通知验证(证书链验证)
- [x] 云闪付APP支付 [appTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=450&acpAPIId=765&bussType=0)
- [ ] 统一支付接口 [trans](https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=568&acpAPIId=740&bussType=1)
- [x] 当日消费撤销 [backTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=766&apiservId=450&version=V2.2&bussType=0)
- [ ] 退款 [backTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=755&apiservId=448&version=V2.2&bussType=0)
- [x] 交易状态查询 [queryTrans](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=757&apiservId=448&version=V2.2&bussType=0)
- [ ] 银联加密公钥更新查询 [backTransReq](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=758&apiservId=448&version=V2.2&bussType=0)

## 环境依赖
1. 目前测试 Node [14.15.1](https://nodejs.org/en/download/releases/) 及以上版本正常运行
2. Windows 需要安装 openssl 并添加到运行环境, [点击下载OpenSSL_1_1_1.msi](http://slproweb.com/download/Win64OpenSSL-1_1_1n.msi)

## 安装
#### npm
```bash
npm install @lipingruan/node-unionpay-sdk
```
#### yarn
```bash
yarn add @lipingruan/node-unionpay-sdk
```

## 初始化
```javascript
const Unionpay = require ( '@lipingruan/node-unionpay-sdk' )

const unionpay = new Unionpay ( {
    sandbox: true,
    merId: '商户号',
    consumeCallbackUrl: '付款成功后台回调地址',
    cancelOrderCallbackUrl: '订单撤销后台回调地址',
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
| consumeCallbackUrl | string | null | 付款成功回调地址 |
| cancelOrderCallbackUrl | string | null | [撤销订单回调地址](https://open.unionpay.com/tjweb/acproduct/APIList?acpAPIId=766&apiservId=450&version=V2.2&bussType=0) |
| accessType | string | 0 | [接入类型](https://open.unionpay.com/tjweb/acproduct/APIList?apiservId=448&acpAPIId=754&bussType=0) |
| channelType | string | 07 | 渠道类型 |
| currencyCode | string | 156 | 交易货币代码 |

## 在线Web网关支付
```javascript
try {

    const { redirect } = await unionpay.createWebOrder ( {
        // required:string 商户订单号
        orderId: '20220307968496436', 
        // required:number 交易金额, 单位:分
        amount: 100, 
        // optional:string 交易描述
        description: '这是交易描述', 
        // optional:string 附加数据, 回调原样返回
        attach: 'a=1&b=2', 
        // required:string 渠道类型, 07:PC/平板,09:手机
        channelType: '07', 
        // required:string 前端付款完成后跳转页面
        consumeTargetUrl: 'https://xxx.com/order?id=20220307968496436'
    } )
    // redirect 为银联付款网页链接
} catch ( error ) {
    
    console.error ( '银联下单失败:', error.message )
}
```

## 云闪付APP支付
```javascript
try {

    const { tn } = await unionpay.createAppOrder ( {
        // required:string 商户订单号
        orderId: '20220307968496436', 
        // required:number 交易金额, 单位:分
        amount: 100, 
        // required:string 交易描述
        description: '这是交易描述', 
        // optional:string 附加数据, 回调原样返回
        attach: 'a=1&b=2', 
        // required:string 前端付款完成后跳转页面
        consumeTargetUrl: 'https://xxx.com/order?id=20220307968496436'
    } )
    // tn 为银联受理订单号, 调起云闪付支付使用
} catch ( error ) {
    
    console.error ( '银联下单失败:', error.message )
}
```

## 订单查询
```javascript
const { status, queryId, body } = await unionpay.queryOrder ( {
    orderId: '付款单号/撤单单号/退款单号',
} )
// status SUCCESS: 成功, PENDING: 处理中, FAIL: 失败
// queryId 为银联流水号，存到数据库
// body 为响应原始数据
```

## 当日消费撤销
```javascript
const body = await unionpay.cancelOrder ( {
    orderId: '撤单单号，不是付款单号',
    queryId: '原订单的银联流水号，查付款订单或者付款回调里的queryId',
    amount: 100, // 订单金额， 必须与原订单一致
} )
// body 为响应原始数据
// 没报错表示发送成功，后续接收cancelOrderCallbackUrl回调或主动调用queryOrder接口查询
```

## 银联数据验证
```javascript
const body = { } // 银联回调数据

const verified = unionpay.getResponseVerify ( body )

console.log ( `回调验证${verified?'通过':'失败'}` )
```
