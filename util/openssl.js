
const child_process = require ( 'child_process' )

const fs = require ( 'fs' )

const IO = require ( './io' )



exports.isCertification = ( certification ) => {

    return Buffer.isBuffer ( certification ) || (
        'string' === typeof certification && certification.startsWith ( '-----' )
    )
}



/**
 * 验证证书链合法性
 * @param {string|Buffer} certification
 * @param {[string]|string} CA
 * @returns {boolean}
 */
exports.verifySigningChain = ( certification, CA ) => {

    if ( exports.isCertification ( certification ) ) certification = IO.writeTmpFile ( certification )

    let rootCA = '', middleCA = [ ]

    if ( Array.isArray ( CA ) ) {

        CA = CA.concat ( [ ] )

        let index = -1, size = CA.length

        while ( ++index < size ) {

            const xCA = CA [ index ]

            if ( exports.isCertification ( xCA ) ) CA [ index ] = IO.writeTmpFile ( xCA )
        }

        rootCA = CA [ 0 ]
        middleCA = CA.slice ( 1 )
    } else {

        if ( exports.isCertification ( CA ) ) CA = IO.writeTmpFile ( CA )

        rootCA = CA
    }

    const params = middleCA.length ? [
        'verify',
        '-verbose',
        '-CAfile',
        rootCA,
        ...middleCA.map ( ca => [ '-untrusted', ca ] ).flat ( ),
        certification,
    ] : [
        'verify',
        '-verbose',
        '-CAfile',
        rootCA,
        certification,
    ]

    const task = child_process.spawnSync ( 'openssl', params )

    const stdout = task.stdout.toString ( ).trim ( )

    const stderr = task.stderr.toString ( ).trim ( )

    return stdout.endsWith ( 'OK' ) || stderr.endsWith ( 'OK' )
}



/**
 * convert pkcs12 file to x509 pem format
 * @param {string|Buffer} certification
 * @param options
 * @param {string?} options.password
 * @returns {string}
 */
exports.getX509FromPKCS12 = ( certification, options ) => {

    const { password } = options

    if ( Buffer.isBuffer ( certification ) ) certification = IO.writeTmpFile ( certification )

    const savePath = IO.getTmpFile ( 'pem' )

    const params = [ 'pkcs12', '-in', certification, '-nodes', '-out', savePath ]

    if ( password ) params.push ( '-passin', 'pass:' + password )

    const task = child_process.spawnSync ( 'openssl', params )

    const stderr = task.stderr.toString ( ).trim ( )

    if ( stderr && !stderr.endsWith ( 'OK' ) ) throw new Error ( stderr )

    return savePath
}



/**
 * 从 pfx 导出RSA密钥
 * @param {Buffer|string} certification
 * @param {'publicKey'|'privateKey'} type
 * @param options
 * @param {string?} options.password
 * @param {boolean?} options.returnsKey
 * @returns {{path:string,key?:Buffer}}
 */
exports.getKeyFromX509 = ( certification, type = 'privateKey', options = { } ) => {

    const { password, returnsKey } = options

    if ( Buffer.isBuffer ( certification ) ) certification = IO.writeTmpFile ( certification )

    const tmpFile = IO.getTmpFile ( 'pem' )

    const params = [ 'rsa', '-in', certification, '-out', tmpFile ]

    if ( type === 'publicKey' ) params.push ( '-pubout' )

    if ( password ) params.push ( '-passin', 'pass:' + password )

    const task = child_process.spawnSync ( 'openssl', params )

    const stdout = task.stdout.toString ( ).trim ( )

    const stderr = task.stderr.toString ( ).trim ( )

    const success = stdout.includes ( 'writing RSA key' ) || stderr.includes ( 'writing RSA key' )

    if ( !success ) throw new Error ( 'PublicKey writing fail' )

    const result = { path: tmpFile }

    if ( returnsKey ) result.key = fs.readFileSync ( tmpFile )

    return result
}


/**
 *
 * @param {string|Buffer} certification
 * @param {'publicKey'|'privateKey'} type
 * @param options
 * @param {string?} options.password
 * @param {boolean?} options.returnsKey
 * @returns {{path:string,key?:Buffer}}
 */
exports.getKeyFromPKCS12 = ( certification, type = 'privateKey', options = { } ) => {

    const { password, returnsKey } = options

    const x509 = exports.getX509FromPKCS12 ( certification, { password } )

    return exports.getKeyFromX509 ( x509, type, { returnsKey } )
}



/**
 * 获取证书序列号
 * @param {string|Buffer} certification
 * @param options
 * @param {string?} options.password
 * @returns {string}
 */
exports.getSerialNumberFromX509 = ( certification, options = {　} ) => {

    const { password } = options

    if ( Buffer.isBuffer ( certification ) ) certification = IO.writeTmpFile ( certification )

    const params = [ 'x509', '-in', certification, '-serial', '-noout' ]

    if ( password ) params.push ( '-passin', 'pass:' + password )

    const task = child_process.spawnSync ( 'openssl', params )

    const stdout = task.stdout.toString ( ).trim ( )

    if ( stdout.startsWith ( 'serial=' ) ) return stdout.slice ( 7 ).trim ( )

    const stderr = task.stderr.toString ( ).trim ( )

    if ( stderr.startsWith ( 'serial=' ) ) return stderr.slice ( 7 ).trim ( )

    throw new Error ( 'Cannot read serial number' )
}



/**
 * 获取证书序列号
 * @param {string|Buffer} certification
 * @param options
 * @param {string?} options.password
 * @returns {string}
 */
exports.getSerialNumberFromPKCS12 = ( certification, options = {　} ) => {

    const x509 = exports.getX509FromPKCS12 ( certification, options )

    return exports.getSerialNumberFromX509 ( x509 )
}
