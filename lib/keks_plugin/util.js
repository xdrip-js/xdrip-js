// util.js
// Equivalent to jamorham.keks.util.Util

const crypto = require('crypto');

/**
 * Generic utility methods (JavaScript port of Util.java)
 */
const Util = {

  /**
   * Convert byte array (Buffer) to uppercase hex string
   * @param {Buffer|null} bytes
   * @returns {string}
   */
  bytesToHex(bytes) {
    if (!bytes || !Buffer.isBuffer(bytes)) return '';
    return bytes.toString('hex').toUpperCase();
  },

  /**
   * Append one buffer to another
   * @param {Buffer} existing
   * @param {Buffer} addon
   * @returns {Buffer}
   */
  arrayAppend(existingParam, addonParam) {
    let existing = existingParam;
    let addon = addonParam;

    if (!Buffer.isBuffer(existing)) existing = Buffer.alloc(0);
    if (!Buffer.isBuffer(addon)) addon = Buffer.alloc(0);

    return Buffer.concat([existing, addon]);
  },

  /**
   * Reduce buffer to specified length (truncate from start)
   * @param {Buffer|null} existing
   * @param {number} length
   * @returns {Buffer|null}
   */
  arrayReduce(existing, length) {
    if (!existing || !Buffer.isBuffer(existing)) return null;
    if (length >= existing.length) return Buffer.from(existing);
    return existing.slice(0, length);
  },

  /**
   * Tolerant hex string to byte array — removes all non-hex chars
   * @param {string} str
   * @returns {Buffer|null}
   */
  tolerantHexStringToByteArray(str, alt = false) {
    if (typeof str !== 'string') return null;
    const cleaned = str.toUpperCase().replace(/[^A-F0-9]/g, '');
    return this.hexStringToByteArray(cleaned, alt);
  },

  /**
   * Strict hex string to byte array
   * @param {string} str
   * @returns {Buffer|null}
   */
  hexStringToByteArray(strParam, alt = false) {
    try {
      if (typeof strParam !== 'string') return null;

      const str = strParam.toUpperCase().trim();
      if (str.length === 0) return null;
      if (str.length % 2 !== 0) return null; // Invalid length

      const len = str.length;
      const data = Buffer.alloc(len / 2);

      for (let i = 0; i < len; i += 2) {
        const high = parseInt(str.charAt(i), 16);
        const low = parseInt(str.charAt(i + 1), 16);
        if (Number.isNaN(high) || Number.isNaN(low)) return null;
        if (alt) {
          data[i / 2] = low * 16 + high;
        } else {
          data[i / 2] = low + high * 16;
        }
      }

      return data;
    } catch (e) {
      return null;
    }
  },

  /**
   * Convert 32-bit integer to 4-byte big-endian buffer
   * @param {number} value
   * @returns {Buffer}
   */
  intToByteArray(value) {
    const buf = Buffer.alloc(4);
    buf.writeInt32BE(value, 0);
    return buf;
  },

  /**
   * Generate a secure random 16-byte key
   * @returns {Buffer}
   */
  getRandomKey() {
    return crypto.randomBytes(16);
  },

};

// Freeze to prevent accidental modification (like Java static final class)
module.exports = Object.freeze(Util);
