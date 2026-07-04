// digest.js
// Equivalent to jamorham.libkeks.Digest

const crypto = require('crypto');
const Util = require('./util');
const { JECPoint } = require('./jec-point');

/**
 * Accumulates data and computes SHA-256 hash into a destination buffer on doFinal()
 *
 * @param {Buffer} destination - The buffer where the final 32-byte SHA-256 hash will be written
 */
class Digest {
  constructor(destination) {
    if (!Buffer.isBuffer(destination) || destination.length < 32) {
      throw new Error('destination must be a Buffer with at least 32 bytes');
    }

    this.store = Buffer.alloc(0);// Accumulated input data
    this.destination = destination;// Final output buffer (not modified until doFinal)
  }

  /**
   * Append more data to be hashed
   * @param {Buffer} data
   */
  update(data) {
    if (!Buffer.isBuffer(data)) {
      throw new Error('data must be a Buffer');
    }

    // Efficiently append: use Buffer.concat
    this.store = Buffer.concat([this.store, data]);
  }

  /**
   * Compute SHA-256 of all accumulated data and write the 32-byte result
   * into the destination buffer starting at offset 0
   */
  doFinal() {
    const hash = crypto.createHash('sha256').update(this.store).digest();

    // Copy the 32-byte hash into destination
    hash.copy(this.destination, 0);

    // Optional: clear store after finalizing (matches typical digest behavior)
    this.store = Buffer.alloc(0);
  }

  updateDigestIncludingSize(pointOrBytes) {
    let bytes;
    let bytesLen = 0;

    if (typeof pointOrBytes.encode === 'function' || pointOrBytes instanceof JECPoint) {
      const point = pointOrBytes.encode ? new JECPoint(pointOrBytes) : pointOrBytes;
      bytes = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x04]), point.toBytes()]);
    } else {
      const lenBuf = Util.intToByteArray(pointOrBytes.length);
      this.update(lenBuf);
      bytes = pointOrBytes;
      bytesLen = lenBuf.length;
    }

    bytesLen += bytes.length;
    this.update(bytes);

    return bytesLen;
  }
}

module.exports = Digest;
