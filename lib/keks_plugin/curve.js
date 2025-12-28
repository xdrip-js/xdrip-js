// curve.js
// JavaScript module equivalent to the provided Java Curve class
// Uses the popular 'elliptic' library (npm install elliptic)
// secp256r1 is also known as 'p256' in this library

const { ec: EC } = require('elliptic');

const ec = new EC('p256'); // 'p256' is secp256r1 / prime256v1 / NIST P-256

const curve = {
  name: 'secp256r1',

  // Generator point G (ECPoint equivalent)
  G: ec.g, // Predefined base point

  // Curve object (ECCurve equivalent)
  curve: ec.curve,

  // Order of the curve Q (BigInteger equivalent, using elliptic's BN)
  Q: ec.n,

  n: ec.n,

  // Q - 1
  QM1: ec.n.subn(1),

  // Field size in bits
  CURVE_BITS: 256,

  // Field element size in bytes (ceil(256/8) = 32)
  FIELD_SIZE: 32,

  // PACKET_SIZE = FIELD_SIZE * 5 = 160 (likely for some protocol-specific packet)
  PACKET_SIZE: 32 * 5, // 160

  /**
   * Generates a secure random exponent (scalar) in the range [1, Q-1]
   * Equivalent to BigIntegers.createRandomInRange(ONE, QM1, random)
   * @returns {BN} Random BigNumber (use .toArrayLike(Buffer, 'be', 32) for 32-byte
   * big-endian buffer if needed)
   */
  getExponent() {
    // Generate random bytes, reduce modulo n (order), and ensure it's in [1, n-1]
    // elliptic provides a safe method for this
    return ec.genKeyPair().getPrivate();
  },
};

module.exports = curve;
