// curve.js

const crypto = require('crypto');
const BN = require('bn.js');
const debug = require('debug')('keks-calc');
const { ec: EC } = require('elliptic');

const ec = new EC('p256');

function ecdh(k) {
  const e = crypto.createECDH('prime256v1');
  e.setPrivateKey(Buffer.from(k.toString(16, 64), 'hex'));
  return e;
}

function ecdhPublic(k) {
  return ec.curve.decodePoint(Array.from(ecdh(k).getPublicKey()));
}

let fixedExponent = null; // Will hold a custom exponent if set

const curve = {
  name: 'secp256r1',
  ec,
  G: ec.g,
  curve: ec.curve,
  Q: ec.n,
  n: ec.n,
  QM1: ec.n.subn(1),
  CURVE_BITS: 256,
  FIELD_SIZE: 32,
  PACKET_SIZE: 32 * 5,

  /**
   * Set a fixed exponent to be returned by getExponent().
   * Useful for testing, deterministic behavior, or initialization.
   * @param {BN|string|number|Buffer} exponent - BN, hex string, number, or Buffer
   */
  setFixedExponent(exponent) {
    if (exponent === null) {
      fixedExponent = null;
      debug('Fixed curve exponent cleared - will use random');
      return;
    }

    // Accept various input formats
    if (typeof exponent === 'string') {
      fixedExponent = ec.keyFromPrivate(exponent, 'hex').getPrivate();
    } else if (Buffer.isBuffer(exponent)) {
      fixedExponent = ec.keyFromPrivate(exponent).getPrivate();
    } else {
      fixedExponent = ec.n.fromRed ? exponent : ec.keyFromPrivate(exponent).getPrivate();
    }

    debug(`Fixed curve exponent set: ${fixedExponent.toString(16)}`);
  },

  /**
   * Returns either the fixed exponent (if set) or a new random one.
   * @returns {BN} Private key (exponent) as BigNumber
   */
  getExponent() {
    if (fixedExponent !== null) {
      return fixedExponent;
    }

    // Default: generate secure random exponent
    const keyPair = ec.genKeyPair();
    return keyPair.getPrivate();
  },

  // Optional: Check if fixed exponent is active
  isUsingFixedExponent() {
    return fixedExponent !== null;
  },

  // Clear fixed exponent and go back to random
  clearFixedExponent() {
    fixedExponent = null;
    debug('Fixed curve exponent cleared');
  },

  /**
   * k * P on P-256, computed by OpenSSL (Node crypto ECDH) instead of the
   * pure-JS `elliptic` multiply. Same result as P.mul(k), returned as an
   * elliptic point. On the collector's Pi Zero elliptic takes 200-900 ms per
   * multiply and a real G7 allows only ~3.3 s per J-PAKE phase; OpenSSL takes
   * 1-9 ms.
   * @param {Point} P elliptic point
   * @param {BN} k scalar
   * @returns {Point}
   */
  mul(P, k) {
    const kr = k.umod(ec.n);
    if (kr.isZero() || P.isInfinity()) return ec.curve.point(null, null);
    try {
      if (P.eq(ec.g)) return ecdhPublic(kr);
      if (kr.eq(ec.n.subn(1))) return P.neg();
      const pub = Buffer.from(P.encode('array', false));
      const x = new BN(ecdh(kr).computeSecret(pub));
      // y from the curve equation; p = 3 mod 4 so redSqrt is a single pow
      const red = x.toRed(ec.curve.red);
      const rhs = red.redSqr().redMul(red).redIAdd(ec.curve.a.redMul(red)).redIAdd(ec.curve.b);
      const Q = ec.curve.point(x, rhs.redSqrt().fromRed());
      // pick the y sign: x((k+1)P) must equal x(Q + P)
      const x1 = new BN(ecdh(kr.addn(1).umod(ec.n)).computeSecret(pub));
      return Q.add(P).getX().eq(x1) ? Q : Q.neg();
    } catch (error) {
      debug(`OpenSSL multiply failed (${error.message}); using elliptic`);
      return P.mul(kr);
    }
  },
};

module.exports = curve;
