const { expect } = require('chai');

const Plugin = require('../lib/keks_plugin/plugin');
const Curve = require('../lib/keks_plugin/curve');
const { makeG7Transmitter } = require('./helpers/g7-transmitter');

// On a Pi Zero the first EC-J-PAKE exchange in a fresh process takes ~12 s
// (JIT warm-up of bn.js/elliptic); a second one ~2.5 s. A throwaway exchange
// before scanning keeps the slow part out of the sensor's connection window.
describe('KEKS warm-up', () => {
  afterEach(() => { Plugin.instance = null; });

  it('runs a full throwaway key agreement that succeeds', function () {
    this.timeout(60000);
    const result = Plugin.warmUp();
    expect(result.ok).to.equal(true);
    expect(result.ms).to.be.a('number');
  });

  it('leaves the plugin singleton and curve state untouched', function () {
    this.timeout(60000);
    const plugin = Plugin.getInstance('1234');
    plugin.setPersistence(2, '00112233445566778899aabbccddeeff');
    Plugin.warmUp();
    expect(Plugin.instance).to.equal(plugin);
    expect(plugin.getSharedKey().toString('hex')).to.equal('00112233445566778899aabbccddeeff');
    expect(Curve.isUsingFixedExponent()).to.equal(false);
  });

  it('is run by Transmitter only when asked and no key is saved', () => {
    const calls = [];
    const orig = Plugin.warmUp;
    Plugin.warmUp = () => { calls.push(1); return { ok: true, ms: 0 }; };
    try {
      makeG7Transmitter({ options: { warmUp: true } });
      expect(calls.length).to.equal(1);
      makeG7Transmitter({ options: {} });
      expect(calls.length).to.equal(1);
    } finally {
      Plugin.warmUp = orig;
    }
  });
});

describe('Transmitter first-pairing handshake prep', () => {
  afterEach(() => { Plugin.instance = null; });

  it('precomputes our proofs and defers sensor-proof validation when there is no key', () => {
    const orig = Plugin.warmUp;
    Plugin.warmUp = () => ({ ok: true, ms: 0 });
    try {
      const { transmitter } = makeG7Transmitter({ options: { warmUp: true } });
      expect(transmitter.plugin.deferValidation).to.equal(true);
      expect(transmitter.plugin.context.keyA.zkpCache).to.be.an('object');
      expect(transmitter.plugin.context.keyB.zkpCache).to.be.an('object');
    } finally {
      Plugin.warmUp = orig;
    }
  });
});
