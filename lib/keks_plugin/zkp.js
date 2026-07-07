// zkp.js
const debug = require('debug')('keks-calc');
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
    debug(`  exponent r:${this.exponent.toString('hex')}`);
    debug(`  private x:${this.keyPair.privateKey.toString('hex')}`);
    debug(`  hash h:${hash.toString('hex')}`);

    let proof = this.exponent.sub(hash.mul(this.keyPair.privateKey)).umod(Curve.Q);

    if (proof.isNeg()) {
      proof = proof.add(Curve.Q);
    }

    debug(`  proof neg:${proof.isNeg()} b:${proof.toString('hex')}`);
    return proof;
  }

  static validateZeroKnowledgeProof(g, publicKey, gv, b, party) {
    if (!b) return false;
    const hash = ZKP.getZeroKnowledgeHash(g, gv, publicKey, party);

    debug('Validating ZKP:');
    debug(`  g.X:${g.getX().toString('hex')}`);
    debug(`  g.Y:${g.getY().toString('hex')}`);
    debug(`  gv.X:${gv.point.getX().toString('hex')}`);
    debug(`  gv.Y:${gv.point.getY().toString('hex')}`);
    debug(`  publicKey.X:${publicKey.point.getX().toString('hex')}`);
    debug(`  publicKey.Y:${publicKey.point.getY().toString('hex')}`);
    debug(`  b (proof):${b.toString('hex')}`);
    debug(`  party:${party.toString('hex')}`);
    debug(`  h:${hash.toString('hex')}`);

    const term1 = g.mul(b);
    const term2 = publicKey.point.mul(hash);
    const left = term1.add(term2);

    debug(`  left.X:${left.getX().toString('hex').slice(0, 20)}...`);
    debug(`  gv.X == left.X ?${left.getX().eq(gv.point.getX())}`);
    debug(`  left.Y == gv.Y ?${left.getY().eq(gv.point.getY())}`);

    const valid = left.getX().eq(gv.point.getX()) && left.getY().eq(gv.point.getY());

    debug(`  left == gv ? ${valid}`);

    return valid;
  }

  static getZeroKnowledgeHash(g, gv, gx, party) {
    const digestBuf = Buffer.alloc(32);
    const digest = new Digest(digestBuf);

    const gLen = digest.updateDigestIncludingSize(g);
    const gvLen = digest.updateDigestIncludingSize(gv);
    const gxLen = digest.updateDigestIncludingSize(gx);
    const partyLen = digest.updateDigestIncludingSize(party);

    debug(`Hash input lengths: gLen=${gLen} gvLen=${gvLen} gxLen=${gxLen} partyLen=${partyLen}`);

    digest.doFinal();

    debug(` digestBuf:${digestBuf.toString('hex')}`);

    return new BN(digestBuf).umod(Curve.Q);
  }
}

module.exports = ZKP;
