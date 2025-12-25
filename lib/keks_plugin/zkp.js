// zkp.js
const curve = require('./curve');
const Calc = require('./calc'); // Will be fixed in next step — circular is OK with require

class ZKP {
  constructor(g, keyPair, party) {
    this.exponent = curve.getExponent();
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
    const hash = Calc.getZeroKnowledgeHash(
      this.g,
      this.getGv(),
      this.keyPair.publicKey,
      this.party,
    );
    return this.exponent.sub(hash.mul(this.keyPair.privateKey)).umod(curve.Q);
  }
}

module.exports = ZKP;
