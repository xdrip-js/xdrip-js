// dsa-challenger.js
// JavaScript port of jamorham.keks.DSAChallenger
// Produces raw 64-byte (r || s) ECDSA signature over SHA-256

const crypto = require('crypto');
const curve = require('./curve'); // For BN and curve params

/**
 * DSAChallenger - signs a challenge with ECDSA (secp256r1 + SHA-256)
 * Equivalent to Java DSAChallenger extending SignatureSpi.ecDSA256
 *
 * @param {Object} keyPair - Must have .privateKey as elliptic BN
 */
class DSAChallenger {
  constructor(keyPair) {
    if (!keyPair || !keyPair.privateKey) {
      throw new Error('keyPair with privateKey (BN) is required');
    }
    this.privateKey = keyPair.privateKey; // elliptic BN
  }

  /**
   * Sign the challenge and return raw r || s (64 bytes)
   * @param {Buffer} challenge
   * @returns {Buffer|null} 64-byte signature or null on error
   */
  response(challenge) {
    if (!Buffer.isBuffer(challenge)) {
      return null;
    }

    try {
      // Compute e = SHA256(challenge)
      const hash = crypto.createHash('sha256').update(challenge).digest();

      // Convert hash to BN (big-endian unsigned)
      const e = new this.privateKey.constructor(hash);

      // Generate k (nonce) - secure random in [1, n-1]
      const k = curve.getExponent();

      // Compute point R = k * G
      const R = curve.G.mul(k);
      const r = R.getX().umod(curve.Q);

      if (r.isZero()) {
        // Extremely unlikely — retry would be needed in production
        return null;
      }

      // s = k⁻¹ * (e + r * d) mod n
      const kinv = k.invm(curve.Q);
      const s = kinv.mul(e.add(r.mul(this.privateKey))).umod(curve.Q);

      if (s.isZero()) {
        return null;
      }

      // Convert r and s to 32-byte big-endian buffers (zero-padded)
      const rBytes = r.toArrayLike(Buffer, 'be', 32);
      const sBytes = s.toArrayLike(Buffer, 'be', 32);

      // Concatenate r || s
      return Buffer.concat([rBytes, sBytes]);
    } catch (err) {
      return null;
    }
  }
}

module.exports = DSAChallenger;
