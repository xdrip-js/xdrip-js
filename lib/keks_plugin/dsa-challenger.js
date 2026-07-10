// dsa-challenger.js
const crypto = require('crypto');
const asn1 = require('asn1.js');

const debug = require('debug')('keks-calc');

const ECDSASignature = asn1.define(
  'ECDSASignature',
  function defineECDSASignature() {
    this.seq().obj(
      this.key('r').int(),
      this.key('s').int(),
    );
  },
);

class DSAChallenger {
  /**
   * @param {Buffer} privateKeyDER - PKCS#8 DER encoded EC private key
   */
  constructor(privateKeyDER) {
    if (!Buffer.isBuffer(privateKeyDER)) {
      throw new Error('PKCS#8 DER private key Buffer is required');
    }

    this.privateKey = crypto.createPrivateKey({
      key: privateKeyDER,
      format: 'der',
      type: 'pkcs8',
    });
  }

  /**
   * Sign the challenge and return raw r || s (64 bytes)
   *
   * Equivalent to Java:
   *   engineUpdate(challenge);
   *   engineSign();
   *   sequenceToBytes(..., 2);
   *
   * @param {Buffer} challenge
   * @returns {Buffer|null}
   */
  response(challenge) {
    if (!Buffer.isBuffer(challenge)) {
      return null;
    }

    try {
      const signatureDER = crypto.sign(
        'sha256',
        challenge,
        this.privateKey,
      );

      return DSAChallenger.derToRaw(signatureDER);
    } catch (err) {
      debug(`Exception in challenger response: ${err.message}`);
      return null;
    }
  }

  /**
   * Convert ASN.1 ECDSA signature:
   *
   * SEQUENCE {
   *   INTEGER r
   *   INTEGER s
   * }
   *
   * into:
   *
   * r (32 bytes) || s (32 bytes)
   */
  static derToRaw(signatureDER) {
    const signature = ECDSASignature.decode(signatureDER, 'der');

    const r = Buffer.from(signature.r.toArray('be', 32));
    const s = Buffer.from(signature.s.toArray('be', 32));

    return Buffer.concat([r, s]);
  }
}

module.exports = DSAChallenger;
