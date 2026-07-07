// keypair.js
// JavaScript port of jamorham.keks.KeyPair
// Supports generation, raw scalar/point, and (limited) ASN.1 import

const debug = require('debug')('keks-calc');

const Curve = require('./curve');
const Util = require('./util');

class KeyPair {
  /**
   * @param {BN} privateKey - elliptic BN scalar
   * @param {ECPoint} publicKey - elliptic ECPoint
   */
  constructor(privateKey, publicKey) {
    this.privateKey = privateKey; // BN
    this.publicKey = publicKey; // ECPoint
    this.zkpCache = null;
  }

  // ——————————————————— Getters ———————————————————
  getPrivateKey() {
    return this.privateKey; // returns BN
  }

  getPrivateKeyBytes() {
    return this.privateKey.toArrayLike(Buffer, 'be', 32);
  }

  getPublicKey() {
    return this.publicKey;
  }

  getPublicKeyBytes() {
    return this.publicKey.toBytes(false); // uncompressed with 04 prefix
  }

  // ——————————————————— Static factory methods ———————————————————

  /**
   * Generate a new random key pair (mirrors parameterless constructor)
   * @returns {KeyPair}
   */
  static generate() {
    const priv = Curve.getExponent(); // random scalar in [1, n-1]
    const pub = Curve.G.mul(priv);

    return new KeyPair(priv, pub);
  }

  /**
   * Create from raw private key scalar as Buffer (32 bytes big-endian)
   * @param {Buffer} privateBytes
   * @returns {KeyPair|null}
   */
  static fromPrivateBytes(privateBytes) {
    if (!Buffer.isBuffer(privateBytes) || privateBytes.length !== 32) {
      debug(`KeyPair.fromPrivateBytes received invalid private key: ${Util.bytesToHex(privateBytes)}`);
      return null;
    }

    try {
      const priv = new Curve.n.constructor(privateBytes);
      if (priv.cmp(Curve.n) >= 0 || priv.isZero()) {
        return null; // invalid scalar
      }
      const pub = Curve.G.mul(priv);
      return new KeyPair(priv, pub);
    } catch (e) {
      debug(`KeyPair.fromPrivateBytes failed to create KeyPair: ${Util.bytesToHex(privateBytes)}`);
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
      debug(`KeyPair.fromBytes failed to create KeyPair: ${Util.bytesToHex(bytes)}`);
      return null;
    }
  }
}

module.exports = KeyPair;
