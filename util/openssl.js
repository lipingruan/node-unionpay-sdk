
const child_process = require ( 'child_process' )

const path = require ( 'path' )

const os = require ( 'os' )

const fs = require ( 'fs' )

const crypto = require ( 'crypto' )


/**
 * 写入临时文件, 返回文件地址
 * @param {Buffer|string} content 
 * @returns {string}
 */
function writeTmpFile ( content ) {

    const xPath = os.tmpdir ( )

    const md5 = crypto.createHash ( 'md5' ).update ( content ).digest ( 'hex' )

    const filename = `cert_${md5}.pem`

    const savePath = path.join ( xPath, filename )

    console.log ( 'save:', savePath )

    if ( fs.existsSync ( savePath ) ) return savePath
    
    fs.writeFileSync ( savePath, content )

    return savePath
}


function isCertification ( cert ) {

    return Buffer.isBuffer ( cert ) || (
        'string' === typeof cert && cert.startsWith ( '-----' )
    )
}


/**
 * 验证证书链合法性
 * @param {string} certification 
 * @param {[string]|string} CA 
 */
exports.verifySigningChain = ( certification, CA ) => {

    if ( isCertification ( certification ) ) certification = writeTmpFile ( certification )

    let rootCA = '', middleCA = [ ]

    if ( Array.isArray ( CA ) ) {

        CA = CA.concat ( [ ] )

        let index = -1, size = CA.length

        while ( ++index < size ) {

            const xCA = CA [ index ]

            if ( isCertification ( xCA ) ) CA [ index ] = writeTmpFile ( xCA )
        }

        rootCA = CA [ 0 ]
        middleCA = CA.slice ( 1 )
    } else {

        if ( isCertification ( CA ) ) CA = writeTmpFile ( CA )

        rootCA = CA
    }

    const params = middleCA.length ? [
        'verify',
        '-verbose',
        '-CAfile',
        rootCA,
        '-untrusted',
        ...middleCA,
        certification,
    ] : [
        'verify',
        '-verbose',
        '-CAfile',
        rootCA,
        certification,
    ]

    const result = child_process.spawnSync ( 'openssl', params )

    const stdout = result.stdout.toString ( ).trim ( )

    return stdout.endsWith ( 'OK' )
}

