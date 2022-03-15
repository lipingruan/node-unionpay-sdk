/**
 * 常用IO方法封装
 * request 支持非UTF-8编码
 * stream <-> buffer 互转
 */

const Stream = require('stream');

const http = require ( 'http' );

const https = require ( 'https' );

const querystring = require ( 'querystring' );

const iconv = require ( 'iconv-lite' );



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

    string = iconv.decode ( buffer, charset )
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
 * @param {*} body 
 * @param {'json'|'form'} bodyType
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

    const isHTTPS = 'string' === typeof options ? options.indexOf ( 'https' ) === 0 :
    'object' === typeof options ? options.protocol.indexOf ( 'https' ) === 0 : false;

    const request = isHTTPS ?
    https.request ( options, callback ) :
    http.request ( options, callback );
    
    if ( body ) {

      let bodyString = ''
      
      switch ( bodyType ) {

        case 'form':
          request.setHeader ( 'Content-Type', 'application/x-www-form-urlencoded' )
          bodyString = querystring.stringify ( body )
          break

        default:
          request.setHeader ( 'Content-Type', 'application/json' )
          bodyString = JSON.stringify ( body )
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
