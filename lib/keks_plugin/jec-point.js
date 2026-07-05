// JECPoint.js
// Equivalent to the Java JECPoint class, compatible with your curve.js (elliptic + secp256r1)

const { ec: EC } = require('elliptic');
const BN = require('bn.js');

const ec = new EC('p256'); // 'p256' is secp256r1 / prime256v1 / NIST P-256

/**
 * Wrapper class similar to the original Java JECPoint
 */
class JECPoint {
  /**
   * @param {ec.KeyPair | ec.Point} point - An elliptic EC point
   */
  constructor(point) {
    // Accept raw Point or KeyPair-like object
    this.point = point.getPublic ? point.getPublic() : point;
  }

  /**
   * Static factory: Create a point from raw X and Y coordinate byte arrays
   * (32 bytes each, big-endian)
   * Equivalent to Java: pointFromBytes(xBytes, yBytes)
   *
   * @param {Uint8Array|Buffer|Array<number>} xBytes - 32-byte X coordinate
   * @param {Uint8Array|Buffer|Array<number>} yBytes - 32-byte Y coordinate
   * @returns {JECPoint}
   */
  static pointFromBytes(xBytes, yBytes) {
    const point = ec.curve.point(new BN(xBytes), new BN(yBytes));

    // Validate that it's on the curve (throws if invalid)
    if (!point.validate()) {
      throw new Error('Point is not on curve');
    }

    return new JECPoint(point);
  }

  getEncoded(compressed = false) {
    if (compressed) {
      // Compressed format: 0x02 or 0x03 + X (33 bytes total)
      const xBytes = this.point.getX().toArrayLike(Buffer, 'be', 32);
      const prefix = this.point.getY().isOdd() ? 0x03 : 0x02;
      return Buffer.concat([Buffer.from([prefix]), xBytes]);
    }

    // Uncompressed format: 0x04 + X + Y (65 bytes total)
    const xBytes = this.point.getX().toArrayLike(Buffer, 'be', 32);
    const yBytes = this.point.getY().toArrayLike(Buffer, 'be', 32);
    return Buffer.concat([Buffer.from([0x04]), xBytes, yBytes]);
  }

  /**
   * Serialize the point to raw bytes: X (32) || Y (32) = 64 bytes
   * Matches Java toBytes():
   * arrayAppend(point.getXCoord().getEncoded(), point.getYCoord().getEncoded())
   *
   * @returns {Buffer} 64-byte buffer (X || Y), big-endian padded to 32 bytes each
   */
  toBytes() {
    const xBytes = this.point.getX().toArrayLike(Buffer, 'be', 32);
    const yBytes = this.point.getY().toArrayLike(Buffer, 'be', 32);
    return Buffer.concat([xBytes, yBytes]);
  }
}

module.exports = { JECPoint };
