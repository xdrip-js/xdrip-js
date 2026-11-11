const { expect } = require('chai');

const Plugin = require('../lib/keks_plugin/plugin');
const Calc = require('../lib/keks_plugin/calc');

// A real G7 answered our round-1 reply with status 0a0300 and hung up when the
// reply came 13.5 s after its own packet (8.4 s of it validating the sensor's
// proof in pure JS on a Pi Zero). Our round-1/2 packets do not depend on the
// sensor, so they can be computed before connecting and sent at once; the
// sensor's proofs are validated right after, while it works on its next phase.
// Nothing derived from the password or the sensor's keys (round 3, the shared
// key) is produced until both proofs have validated.

// Drive an alice(sensor-side)/bob(our side) exchange like Plugin.warmUp, with
// an optional hook to tamper with what alice sends.
function exchange(bob, { tamper = (round, bytes) => bytes } = {}) {
  const alice = new Plugin('0000', 'alice');
  alice.amConnected();
  bob.amConnected();
  let an = bob.aNext();
  alice.receivedResponse(an[0]);
  alice.changeState(Plugin.Round1);
  const results = [];
  [[Plugin.Round1, Plugin.Round2], [Plugin.Round2, Plugin.Round3],
    [Plugin.Round3, Plugin.RequestAuth]].forEach(([round, next], i) => {
    if (results.includes(false)) return;
    const bn = alice.aNext();
    const ok = bob.receivedData(tamper(i + 1, Buffer.from(bn[1])));
    results.push(ok);
    if (!ok) return;
    an = bob.aNext();
    if (bob.deferValidation && i < 2) results.push(bob.validateDeferred());
    alice.changeState(round);
    alice.receivedData(an[1]);
    alice.changeState(next);
  });
  return { alice, results };
}

describe('KEKS precomputed and deferred round 1/2', function () {
  this.timeout(120000);
  let validations;
  let orig1;
  let orig2;

  beforeEach(() => {
    validations = [];
    orig1 = Calc.validateRound1PacketContext;
    orig2 = Calc.validateRound2PacketContext;
    Calc.validateRound1PacketContext = (c) => { if (c.role === 'bob') validations.push(1); return orig1(c); };
    Calc.validateRound2PacketContext = (c) => { if (c.role === 'bob') validations.push(2); return orig2(c); };
  });
  afterEach(() => {
    Calc.validateRound1PacketContext = orig1;
    Calc.validateRound2PacketContext = orig2;
    Plugin.instance = null;
  });

  it('precompute() prepares both of our round proofs before connecting', () => {
    const bob = new Plugin('0000', 'bob');
    bob.precompute();
    expect(bob.context.keyA.zkpCache).to.be.an('object');
    expect(bob.context.keyB.zkpCache).to.be.an('object');
  });

  it('accepts round 1 without validating it until validateDeferred()', () => {
    const bob = new Plugin('0000', 'bob');
    bob.deferValidation = true;
    bob.amConnected();
    const alice = new Plugin('0000', 'alice');
    alice.amConnected();
    alice.receivedResponse(bob.aNext()[0]);
    alice.changeState(Plugin.Round1);
    expect(bob.receivedData(Buffer.from(alice.aNext()[1]))).to.equal(true);
    expect(validations).to.deep.equal([]);
    bob.aNext(); // our reply goes out before any validation
    expect(bob.validateDeferred()).to.equal(true);
    expect(validations).to.deep.equal([1]);
  });

  it('still agrees on the shared key with deferred validation', () => {
    const bob = new Plugin('0000', 'bob');
    bob.deferValidation = true;
    bob.precompute();
    const { alice, results } = exchange(bob);
    expect(results.every(Boolean)).to.equal(true);
    expect(validations).to.deep.equal([1, 2]);
    expect(Buffer.compare(bob.getSharedKey(), alice.getSharedKey())).to.equal(0);
  });

  it('refuses round 3 (no password-derived reply) if a deferred proof is invalid', () => {
    const bob = new Plugin('0000', 'bob');
    bob.deferValidation = true;
    let round3Requested = false;
    const origR3 = Calc.getRound3Packet;
    Calc.getRound3Packet = (c) => { round3Requested = true; return origR3(c); };
    try {
      const { results } = exchange(bob, {
        // corrupt the proof scalar of the sensor's round-1 packet
        tamper: (round, bytes) => { if (round === 1) bytes[150] ^= 0xff; return bytes; },
      });
      expect(results[0]).to.equal(true); // stored, not yet validated
      expect(results[1]).to.equal(false); // deferred validation fails
      expect(round3Requested).to.equal(false);
      // and a round-3 packet is not accepted afterwards either
      bob.changeState(Plugin.Round3);
      expect(bob.receivedData(Buffer.alloc(160, 1))).to.equal(false);
    } finally {
      Calc.getRound3Packet = origR3;
    }
  });

  // Attempt 54 (2026-11-10): the real G7 accepted all three J-PAKE phases,
  // but we spent 2.8 s checking proofs before sending our round-3 value and
  // it hung up 3.5 s after its packet. In J-PAKE both sides send round 2 at
  // once and check each other's proof afterwards; our value needs only the
  // sensor's (already verified) round-1 keys. Check its round-3 proof before
  // deriving the shared key instead.
  describe('round 3 with deferred validation', () => {
    let r3;
    let orig3;
    beforeEach(() => {
      r3 = 0;
      orig3 = Calc.validateRound3Packet;
      Calc.validateRound3Packet = (c) => { if (c.role === 'bob') r3 += 1; return orig3(c); };
    });
    afterEach(() => { Calc.validateRound3Packet = orig3; });

    it("sends our round-3 value before checking the sensor's round-3 proof", () => {
      const bob = new Plugin('0000', 'bob');
      bob.deferValidation = true;
      bob.precompute();
      const { alice, results } = exchange(bob);
      expect(results.every(Boolean)).to.equal(true);
      expect(r3).to.equal(0); // our round-3 reply already went out
      expect(Buffer.compare(bob.getSharedKey(), alice.getSharedKey())).to.equal(0);
      expect(r3).to.equal(1); // checked once, before the key was derived
    });

    it('refuses to derive the shared key if the deferred round-3 proof is invalid', () => {
      const bob = new Plugin('0000', 'bob');
      bob.deferValidation = true;
      exchange(bob, {
        tamper: (round, bytes) => { if (round === 3) bytes[150] ^= 0xff; return bytes; },
      });
      expect(bob.validateDeferred()).to.equal(false);
      expect(bob.getSharedKey()).to.not.be.ok; // eslint-disable-line no-unused-expressions
    });
  });

  it('keeps immediate validation by default (xDrip+ behaviour)', () => {
    const bob = new Plugin('0000', 'bob');
    bob.amConnected();
    const alice = new Plugin('0000', 'alice');
    alice.amConnected();
    alice.receivedResponse(bob.aNext()[0]);
    alice.changeState(Plugin.Round1);
    bob.receivedData(Buffer.from(alice.aNext()[1]));
    expect(validations).to.deep.equal([1]);
  });
});
