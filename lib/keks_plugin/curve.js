// curve.js

const debug = require('debug')('keks-plugin:debug');
const { ec: EC } = require('elliptic');

const ec = new EC('p256');

let fixedExponent = null; // Will hold a custom exponent if set

const curve = {
  name: 'secp256r1',
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
    if (!exponent) {
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
    if (fixedExponent) {
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
};

module.exports = curve;
