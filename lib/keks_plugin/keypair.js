// keypair.js
// JavaScript port of jamorham.keks.KeyPair
// Supports generation, raw scalar/point, and (limited) ASN.1 import

const curve = require('./curve');

class KeyPair {
  /**
   * @param {BN} privateKey - elliptic BN scalar
   * @param {ECPoint} publicKey - elliptic ECPoint
   */
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey; // BN
    this.publicKey = publicKey; // ECPoint
  }

  getPrivateKey() {
    return this.privateKey;
  }

  getPublicKey() {
    return this.publicKey;
  }

  // ——————————————————— Static factory methods ———————————————————

  /**
   * Generate a new random key pair (mirrors parameterless constructor)
   * @returns {KeyPair}
   */
  static generate() {
    const priv = curve.getExponent(); // random scalar in [1, n-1]
    const pub = curve.G.mul(priv);
    return new KeyPair(priv, pub);
  }

  /**
   * Create from raw private key scalar as Buffer (32 bytes big-endian)
   * @param {Buffer} privateBytes
   * @returns {KeyPair|null}
   */
  static fromPrivateBytes(privateBytes) {
    if (!Buffer.isBuffer(privateBytes) || privateBytes.length !== 32) {
      return null;
    }

    try {
      const priv = new curve.Q.constructor(privateBytes, 'be');
      if (priv.cmp(curve.Q) >= 0 || priv.isZero()) {
        return null; // invalid scalar
      }
      const pub = curve.G.mul(priv);
      return new KeyPair(priv, pub);
    } catch (e) {
      return null;
    }
  }

  /**
   * Create from raw byte arrays: [[public], [private]] or [public, private]
   * @param {Buffer[]|Buffer[][]} bytes
   * @returns {KeyPair|null}
   */
  static fromBytes(bytes) {
    try {
      let privateBytes;

      if (Array.isArray(bytes[0])) {
        // [[pub], [priv]]
        [, privateBytes] = [bytes[0][0], bytes[1][0]];
      } else {
        // [pub, priv]
        [, privateBytes] = bytes;
      }

      // For KEKS, we usually use raw scalar, not encoded public key
      // So prioritize private key import
      return this.fromPrivateBytes(privateBytes);
    } catch (e) {
      return null;
    }
  }
}

module.exports = KeyPair;
