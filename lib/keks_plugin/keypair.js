// keypair.js
// JavaScript port of jamorham.keks.KeyPair
// Supports generation, raw scalar/point, and (limited) ASN.1 import

const asn1 = require('asn1.js');
const debug = require('debug')('keks-calc');

const Curve = require('./curve');
const Util = require('./util');

const PrivateKeyInfo = asn1.define(
  'PrivateKeyInfo',
  function definePrivateKeyInfo() {
    this.seq().obj(
      this.key('version').int(),
      this.key('algorithm').seq(),
      this.key('privateKey').octstr(),
    );
  },
);

const ECPrivateKey = asn1.define(
  'ECPrivateKey',
  function defineECPrivateKey() {
    this.seq().obj(
      this.key('version').int(),
      this.key('privateKey').octstr(),
      this.key('parameters').optional(),
      this.key('publicKey').optional(),
    );
  },
);

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
   * Create from a Buffer with a PKCS#8 DER encoded private key
   * @param {Buffer} privateKeyBytes
   * @returns {KeyPair|null}
   */
  static fromDEREncodedBytes(keyBytes) {
    try {
      const parsed = PrivateKeyInfo.decode(keyBytes, 'der');
      const ecKey = ECPrivateKey.decode(parsed.privateKey, 'der');

      const key = new Curve.n.constructor(ecKey.privateKey);

      if (key.cmp(Curve.n) >= 0 || key.isZero()) {
        debug(
          `Invalid DER private key: ${Util.bytesToHex(keyBytes)}`,
        );
        return null;
      }

      const pub = Curve.G.mul(key);

      debug(`Private key: ${key.toString(16)}`);

      return new KeyPair(key, pub);
    } catch (err) {
      debug(
        `Unable to parse DER private key: ${err.message}`,
      );
      return null;
    }
  }

  /**
   * Create from raw private key scalar as Buffer (32 bytes big-endian)
   * @param {Buffer} privateBytes
   * @returns {KeyPair|null}
   */
  static fromPrivateBytes(privateBytes) {
    if (!Buffer.isBuffer(privateBytes)) {
      debug(`KeyPair.fromPrivateBytes received invalid private key: ${Util.bytesToHex(privateBytes)}`);
      return null;
    }

    if (privateBytes.length !== 32) {
      debug(`KeyPair.fromPrivateBytes received unexpected private key length: ${privateBytes.length}`);
    }

    try {
      const priv = new Curve.n.constructor(privateBytes);
      if (priv.cmp(Curve.n) >= 0 || priv.isZero()) {
        debug(`KeyPair.fromPrivateBytes received unexpected private key length: ${privateBytes.length}`);
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
