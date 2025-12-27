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

  static updateDigestIncludingSize(digest, pointOrBytes) {
    let bytes;
    if (typeof pointOrBytes.encode === 'function') {
      bytes = new JECPoint(pointOrBytes).toBytes();
    } else if (pointOrBytes instanceof JECPoint) {
      bytes = pointOrBytes.toBytes();
    } else {
      bytes = pointOrBytes;
    }
    digest.update(Util.intToByteArray(bytes.length));
    digest.update(bytes);
  }
}

module.exports = Digest;
