const zlib = require('zlib');

/**
 * Deserialize xDrip QR v2 payload
 *
 * @param {Buffer} buffer - decoded (gunzipped) QR payload
 * @returns {Map<string, string> | null}
 */
function deserializeQr2(buffer) {
  if (!Buffer.isBuffer(buffer)) return null;

  let offset = 0;

  // Java ByteBuffer.getShort() is BIG-ENDIAN signed short
  const readShort = () => {
    if (offset + 2 > buffer.length) {
      throw new Error('Unexpected end of buffer');
    }
    const value = buffer.readInt16BE(offset);
    offset += 2;
    return value;
  };

  const readBytes = (len) => {
    if (offset + len > buffer.length) {
      throw new Error('Unexpected end of buffer');
    }
    const slice = buffer.slice(offset, offset + len);
    offset += len;
    return slice;
  };

  const bytesToHex = (buf) =>
    [...buf].map(b => b.toString(16).padStart(2, '0')).join('');

  try {
    const count = readShort();

    if (count < 1 || count > 100) {
      console.error(`Count invalid on QR Code ${count}`);
      return null;
    }

    console.debug(`QR code element count: ${count}`);

    const reply = new Map();

    for (let i = 0; i < count; i++) {
      const keyLen = readShort();
      const keyBytes = readBytes(keyLen);

      const valueLen = readShort();
      const valueBytes = readBytes(valueLen);

      let keyString = keyBytes.toString('utf8');
      let isBinary = false;

      if (keyString.startsWith('b__')) {
        keyString = keyString.substring(3);
        isBinary = true;
      }

      console.debug(`KEY: ${keyString} byte length: ${valueLen}`);

      if (isBinary) {
        reply.set(keyString, bytesToHex(valueBytes));
      } else {
        reply.set(keyString, valueBytes.toString('utf8'));
      }
    }

    return reply;

  } catch (err) {
    console.error(`QR code decoding error: ${err}`);
    return null;
  }
}

/**
 * Decode an xdp2 QR payload (Dexcom / xDrip format)
 *
 * @param {string} qrText - Full QR contents starting with "xdp2:"
 * @returns {Buffer} Decoded binary payload
 */
function decodeXdp2(qrText) {
  if (typeof qrText !== 'string') {
    throw new TypeError('QR text must be a string');
  }

  if (!qrText.startsWith('xdp2:')) {
    throw new Error('Not an xdp2 QR code');
  }

  // Strip prefix
  const base64Payload = qrText.slice(5);

  // Base64 decode
  const compressed = Buffer.from(base64Payload, 'base64');

  // GZIP inflate
  const decoded = zlib.gunzipSync(compressed);

  return decoded;
}


// paste in decoded text from the QR code at https://navid200.github.io/xDrip/docs/G6-Recommended-Settings.html
// this was decoded using the https://zxing.org/w/decode.jspx QR decoder
const qrText = 'xdp2:H4sIAAAAAAAAAGNgZuBKio/PTs0uji8wZugyaGxnYmQwEGZj12rzOGfLxMjGAWYwM7Kz5BpkMzEysigw1Py+Ou3bc5fyHQdefvu+sEQ9TkDu2/5aiVMfBBsvqm+tXOjC7MTAEihxOG6e4/MHqf7vGmSCVh69f1TgPWdkbcyplsQn6+ekpYs0+2ufZP6Yv/qPa2k0Y/PHBdNdz/4/7adfOS9g381lW3uQ3GXEeNGgifEsEJcsYGZiZGISkWTVPyMezP0r7MncU39unW+1ebqr2IAL6lYWZiYDYUNBA3425lAWZh4OF9cIA+MAd0MDOXFeI2MDE0MTQwMjC0OTKCDXFMg1BnONowysDC0MzCCa9A0MdQyAQMfA2MDAJ9DV2bnK0cmx3NFRJzkzPzPVOCwp0CgjJ8o3KyU017Qo3dEgEmuYUSMgFtcb1BrwAJ0lK8zI+J+FyYDBQB7EU2aRMBBrEOn4Jte4x1v8Q0y29KOZsgkcNefuVhrIghSosogZiLBxaLMxsrKyMzPBWYwQaT4WMRaRy5zPY9hVHXWrKpUerzq/qb5ub/YDAz6QND/IMmBQsi5ADlhmdwYDFyYFjyttPZ8n32RxZNz2of5abz2bU0N8662SR//mvrhryv5BnUlB5uL+mpy6u5HOcUaeqn8+vN586pEgb6VDTfkq68nb97CcRopeQ8Z3wKh9BcT90OjVtwna9pqjQMDtSmzFucYKn7n/ghzwRq8BLHoNDIERZmhqamkAil5jU2DUmkO52NME7nj7LXVK8ca6N7P8tsq3GngG3yxfuDZs+kxV/h/JM+qdFp+dv+R/uNzWjD05lknlh+9slX277kWo8AmuGBfT4C7JryuTPRY3HjBo3Au2ERJzrAbMQAol8ubxy5l9/lS2nPFfX4dVntoy071ZfwyiQArkWYINAg38F5gsMGozyCgpKbDS108uytFLKdArTkws1isoysxNzU6t1EvOzwVJ6MOCQQ/IWSS+RBR7GCFiHmu6QYl5xjaUmPdkMHBjUmRYlXm2s+5Y8vr4eaKN7fczAv+zh33gcRBTCfNvXDg/ir0VqOTW651/NyZvN3zNlvjxwMLJGoVL+SxnXTz2VfLVXp951QuEAcTP0rp1BAAA'


const decodedBuffer = decodeXdp2(qrText);
const map = deserializeQr2(decodedBuffer);


console.log('Decoded length:', decodedBuffer.length);

for (const [key, value] of map.entries()) {
  console.log(`${key} = ${value}`);
}

