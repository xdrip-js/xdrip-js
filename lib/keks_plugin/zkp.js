// zkp.js
const debug = require('debug')('keks-zkp');
const BN = require('bn.js');
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
    debug('ZKP proof computation:');
    debug(`  exponent r:${this.exponent.toString(16)}`);
    debug(`  private x:${this.keyPair.privateKey.toString(16)}`);
    debug(`  hash h:${hash.toString(16)}`);

    let proof = this.exponent.sub(hash.mul(this.keyPair.privateKey)).umod(Curve.Q);

    if (proof.isNeg()) {
      proof = proof.add(Curve.Q);
    }

    debug(`  proof neg:${proof.isNeg()} b:${proof.toString(16)}`);
    return proof;
  }

  static validateZeroKnowledgeProof(g, publicKey, gv, b, party) {
    if (!b) return false;
    const hash = ZKP.getZeroKnowledgeHash(g, gv, publicKey, party);

    debug('Validating ZKP:');
    debug(`  g.X:${g.getX().toString(16).slice(0, 20)}...`);
    debug(`  gv.X:${gv.point.getX().toString(16).slice(0, 20)}...`);
    debug(`  gx.X:${publicKey.point.getX().toString(16).slice(0, 20)}...`);
    debug(`  b (proof):${b.toString(16)}`);
    debug(`  party:${party.toString('hex')}`);
    debug(`  h:${hash.toString(16)}`);

    const term1 = g.mul(b);
    const term2 = publicKey.point.mul(hash);
    const left = term1.add(term2);

    debug(`  left.X:${left.getX().toString(16).slice(0, 20)}...`);
    debug(`  gv.X == left.X ?${left.getX().eq(gv.point.getX())}`);
    debug(`  left.Y == gv.Y ?${left.getY().eq(gv.point.getY())}`);

    const valid = left.getX().eq(gv.point.getX()) && left.getY().eq(gv.point.getY());

    debug(`  left == gv ? ${valid}`);

    return valid;
  }

  static getZeroKnowledgeHash(g, gv, gx, party) {
    const digestBuf = Buffer.alloc(32);
    const digest = new Digest(digestBuf);

    const gLen = Digest.updateDigestIncludingSize(digest, g);
    const gvLen = Digest.updateDigestIncludingSize(digest, gv);
    const gxLen = Digest.updateDigestIncludingSize(digest, gx);
    const partyLen = Digest.updateDigestIncludingSize(digest, party);

    debug(`Hash input lengths: ${gLen} ${gvLen} ${gxLen} ${partyLen}`);

    digest.doFinal();

    return new BN(digestBuf).umod(Curve.Q);
  }
}

module.exports = ZKP;
