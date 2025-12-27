// zkp.js
const Curve = require('./curve');
const Digest = require('./digest');

class ZKP {
  constructor(g, keyPair, party) {
    this.exponent = Curve.getExponent();
    this.g = g;
    this.keyPair = keyPair;
    this.party = party;
    this.gv = null;
  }

  getGv() {
    if (!this.gv) {
      this.gv = this.g.mul(this.exponent);
    }
    return this.gv;
  }

  getProof() {
    const hash = ZKP.getZeroKnowledgeHash(
      this.g,
      this.getGv(),
      this.keyPair.publicKey,
      this.party,
    );
    return this.exponent.sub(hash.mul(this.keyPair.privateKey)).umod(Curve.Q);
  }

  static validateZeroKnowledgeProof(g, publicKey, gv, b, party) {
    if (!b) return false;
    const hash = ZKP.getZeroKnowledgeHash(g, gv, publicKey, party);
    const left = g.mul(b).add(publicKey.mul(hash));
    return left.eq(gv);
  }

  static getZeroKnowledgeHash(g, gv, gx, party) {
    const digestBuf = Buffer.alloc(32);
    const digest = new Digest(digestBuf);

    Digest.updateDigestIncludingSize(digest, g);
    Digest.updateDigestIncludingSize(digest, gv);
    Digest.updateDigestIncludingSize(digest, gx);
    Digest.updateDigestIncludingSize(digest, party);

    digest.doFinal();

    const BN = Curve.Q.constructor;
    return new BN(digestBuf).umod(Curve.Q);
  }
}

module.exports = ZKP;
