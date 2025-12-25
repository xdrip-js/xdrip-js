// JECPoint.js
// Equivalent to the Java JECPoint class, compatible with your curve.js (elliptic + secp256r1)

const curve = require('./curve'); // Adjust path if needed, e.g. '../curve' or './curve.js'

/**
 * Wrapper class similar to the original Java JECPoint
 */
class JECPoint {
  /**
   * @param {ec.KeyPair | ec.Point} point - An elliptic EC point
   * (from getPublic() or curve.curve.point())
   */
  constructor(point) {
    // elliptic's EC instance has .keyFromPublic() and .point() methods
    // We store the actual point object
    this.point = point instanceof curve.ec.curve.Point ? point : point.getPublic();
  }

  /**
   * Getter similar to Lombok @Getter
   * @returns {ec.Point}
   */
  getPoint() {
    return this.point;
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
    // Actually: point() takes (x, y) as BN
    const BN = curve.ec.curve.n.constructor; // elliptic's BN class
    const point = curve.ec.curve.point(new BN(xBytes), new BN(yBytes));

    // Validate that it's on the curve (throws if invalid)
    if (!point.validate()) {
      throw new Error('Point is not on curve');
    }

    return new JECPoint(point);
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
