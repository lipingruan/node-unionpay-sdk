/**
 * 常用IO方法封装
 * request 支持非UTF-8编码
 * stream <-> buffer 互转
 */

const Stream = require('stream');

const http = require ( 'http' );

const https = require ( 'https' );

const querystring = require ( 'querystring' );

const os = require ( 'os' );

const crypto = require ( 'crypto' );

const path = require ( 'path' );

const fs = require ( 'fs' );



/**
 * 写入临时文件, 返回文件地址
 * @param {Buffer|string} content
 * @param {string?} extension
 * @returns {string}
 */
exports.writeTmpFile = ( content, extension = 'tmp' ) => {

  const xPath = os.tmpdir ( )

  const md5 = crypto.createHash ( 'md5' ).update ( content ).digest ( 'hex' )

  const filename = [ md5, extension ].join ( '.' )

  const savePath = path.join ( xPath, filename )

  if ( fs.existsSync ( savePath ) ) return savePath

  fs.writeFileSync ( savePath, content )

  return savePath
}



/**
 * 生成临时文件地址
 * @param {string?} extension
 * @returns {string}
 */
exports.getTmpFile = ( extension ) => {

  const xPath = os.tmpdir ( )

  const pid = process.pid.toString( 16 ).padStart ( 4, '0' )

  const time = Date.now ( ).toString ( 16 ).padStart ( 11, '0' )

  const rnd = String ( Math.floor ( Math.random ( ) * 1000 ) ).padStart ( 3, '0' )

  let filename = [ pid, time, rnd ].join ( '_' )

  if ( extension ) filename += '.' + extension

  return path.join ( xPath, filename )
}



/**
 * 
 * @param {Stream} stream 
 * @param {Number} totalLength 
 * @returns {Promise<Buffer>}
 */
exports.stream2buffer = function ( stream, totalLength=0 ) {

  return new Promise ( function ( resolve, reject ) {

    const buffers = [ ];

    stream.on ( 'error', reject );

    if ( totalLength ) {

      stream.on ( 'data', function ( data ) { buffers.push ( data ) } );
    } else {

      stream.on ( 'data', function ( data ) { buffers.push ( data ); totalLength += data.length; } )
    }

    stream.on ( 'end', function ( ) { resolve ( Buffer.concat ( buffers, totalLength ) ) } )
  } );
}



/**
 * 
 * @param {Buffer|String} buffer 
 * @returns {Stream}
 */
exports.buffer2stream = function ( buffer ) {

  const stream = new Stream.Duplex ( );

  stream.push ( buffer );

  stream.push ( null );

  return stream;
}



/**
 * 解析请求post body
 * @param {http.IncomingMessage} request
 * @returns {Object|String}
 */
exports.parseBody = async function ( request ) {

  if ( request.method === 'GET' ) return null;

  const contentSize = request.headers [ 'content-length' ]

  const buffer = await exports.stream2buffer ( request, contentSize ? +contentSize : 0 )

  if ( contentSize && buffer.length !== +contentSize )
  throw new Error ( 'Incorrect Content-Length' )

  if ( request.headers [ 'content-disposition' ] ) return buffer

  let contentType = request.headers [ 'content-type' ]

  let charset = 'utf8'

  // application/json; charset=utf-8
  if ( contentType ) {

    const s = contentType.split ( ';' )

    contentType = s [ 0 ].trim ( )

    let index = 0, size = s.length

    while ( ++index < size ) {

      const b = s [ index ].trim ( )

      if ( b.startsWith ( 'charset=' ) ) {
        
        charset = b.substr ( 8 ).toLowerCase ( )
        
        break
      }
    }
  }

  let string = ''

  if ( charset !== 'utf8' && charset !== 'utf-8' ) {

    const decoder = new TextDecoder ( charset )

    string = decoder.decode ( buffer )
  } else string = buffer.toString ( )

  try {

    switch ( contentType ) {

      case 'text/plain':
        if ( !string.startsWith ( '{' ) && !string.startsWith ( '[' ) ) break
      case 'application/json':
        return JSON.parse ( string )
  
      case 'application/x-www-form-urlencoded':
        return querystring.parse ( string )
  
      default:
          return string
    }
  } catch ( error ) {

    return string
  }
}



/**
 * http(s) request
 * @param {http.RequestOptions|https.RequestOptions|URL|String} options
 * @param {String|URL} options.url
 * @param {*} body 
 * @param {'json'|'form'|'text'} bodyType
 * @returns {Promise<{body:*,headers:http.IncomingHttpHeaders}>}
 */
exports.http = function ( options, body, bodyType = 'json' ) {

  return new Promise ( function ( resolve, reject ) {

    /**
     * 
     * @param {http.IncomingMessage} response 
     */
    const callback = async function ( response ) {

      const headers = response.headers

      const bodyLength = headers [ 'content-length' ]

      if ( bodyLength && +bodyLength > 0 ) {

        try {
  
          resolve ( { 
            body: await exports.parseBody ( response ), 
            headers 
          } );
        } catch ( error ) {
  
          reject ( error );
        }
      } else resolve ( { headers } )
    };

    const isHTTPS =
        'string' === typeof options ?
            options.startsWith ( 'https' ) :
            'object' === typeof options ?
                options.url ?
                    'string' === typeof options.url ? options.url.startsWith ( 'https' ) : options.url.protocol === 'https:' :
                    options.protocol === 'https:'
                : false;

    const request = isHTTPS ?
    options.url ? https.request ( options.url, options, callback ) : https.request ( options, callback ) :
    options.url ? http.request ( options.url, options, callback ) : http.request ( options, callback );
    
    if ( body ) {

      let bodyString = ''
      
      switch ( bodyType ) {

        case 'form':
          request.setHeader ( 'Content-Type', 'application/x-www-form-urlencoded' )
          bodyString = querystring.stringify ( body )
          break

        case 'json':
          request.setHeader ( 'Content-Type', 'application/json' )
          bodyString = JSON.stringify ( body )
          break

        default:
          request.setHeader ( 'Content-Type', 'text/plain' )
          bodyString = String ( body )
          break
      }

      request.setHeader ( 'Content-Length', Buffer.byteLength ( bodyString ) );

      request.method = 'POST';

      request.write ( bodyString );
    }
  
    request.end ( );

    request.on ( 'error', reject );
  } )
}
