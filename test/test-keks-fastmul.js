const { expect } = require('chai');
const BN = require('bn.js');

const Curve = require('../lib/keks_plugin/curve');

// A real G7 gives each J-PAKE phase ~3.3 s. On the collector's Pi Zero the
// pure-JS `elliptic` point multiply takes 200-900 ms, so verifying the
// sensor's round-1 proof took 8.8 s and the sensor hung up after 0a0001
// (attempt 51, 2026-11-10). Node's OpenSSL does the same multiply in 1-9 ms.
// Curve.mul must give exactly the same points as elliptic.
describe('Curve.mul (OpenSSL-backed point multiply)', () => {
  const { ec } = Curve;
  const same = (a, b) => a.eq(b);

  it('multiplies the generator like elliptic', () => {
    for (let i = 0; i < 5; i += 1) {
      const k = ec.genKeyPair().getPrivate();
      expect(same(Curve.mul(Curve.G, k), Curve.G.mul(k))).to.equal(true);
    }
  });

  it('multiplies arbitrary points like elliptic (both y signs)', () => {
    for (let i = 0; i < 10; i += 1) {
      const P = ec.genKeyPair().getPublic();
      const k = ec.genKeyPair().getPrivate();
      expect(same(Curve.mul(P, k), P.mul(k))).to.equal(true);
      expect(same(Curve.mul(P.neg(), k), P.neg().mul(k))).to.equal(true);
    }
  });

  it('handles scalars that are not reduced mod n, and small scalars', () => {
    const P = ec.genKeyPair().getPublic();
    [new BN(1), new BN(2), Curve.n.subn(1), Curve.n.addn(5), Curve.n.subn(2)].forEach((k) => {
      expect(same(Curve.mul(P, k), P.mul(k))).to.equal(true);
    });
  });

  it('returns the point at infinity for k = 0 mod n', () => {
    const P = ec.genKeyPair().getPublic();
    expect(Curve.mul(P, new BN(0)).isInfinity()).to.equal(true);
    expect(Curve.mul(P, Curve.n).isInfinity()).to.equal(true);
  });

  it('does not fall back to the slow elliptic multiply', () => {
    const P = ec.genKeyPair().getPublic();
    const k = ec.genKeyPair().getPrivate();
    const expected = P.mul(k);
    const proto = Object.getPrototypeOf(P);
    const orig = proto.mul;
    proto.mul = () => { throw new Error('slow elliptic mul used'); };
    try {
      expect(same(Curve.mul(P, k), expected)).to.equal(true);
      expect(same(Curve.mul(Curve.G, k), Curve.G.mulAdd(k, P, new BN(0)))).to.equal(true);
    } finally {
      proto.mul = orig;
    }
  });

  it('works on points produced by additions (jacobian inputs)', () => {
    const A = ec.genKeyPair().getPublic();
    const B = ec.genKeyPair().getPublic();
    const S = A.add(B);
    const k = ec.genKeyPair().getPrivate();
    expect(same(Curve.mul(S, k), S.mul(k))).to.equal(true);
  });
});
