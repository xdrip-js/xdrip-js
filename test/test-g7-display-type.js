const { expect } = require('chai');

const Plugin = require('../lib/keks_plugin/plugin');
const { makeG7Transmitter } = require('./helpers/g7-transmitter');

// The last byte of the G7 auth request (02 <8-byte token> <type>) tells the
// sensor which kind of display is connecting; each kind has its own slot:
// 0x01 medical (receiver or pump), 0x02 phone app, 0x03 watch
// (LoopKit g7sim g7/sensor.go DisplayMedical/DisplayPhone/DisplayWatch).
const slotByte = (msg) => msg.byteSequence[msg.byteSequence.length - 1];

describe('G7 display type (auth request slot byte)', () => {
  afterEach(() => { Plugin.instance = null; });

  it('defaults to the phone slot (0x02), as before', () => {
    const plugin = Plugin.getInstance('1234');
    expect(slotByte(plugin.getAuthRequestTxG7())).to.equal(0x02);
  });

  it('keeps the alternate channel meaning the medical slot (0x01)', () => {
    const plugin = Plugin.getInstance('1234');
    plugin.setPersistence(6, Buffer.from([0x02]));
    expect(slotByte(plugin.getAuthRequestTxG7())).to.equal(0x01);
  });

  it('uses an explicit display type when one is set', () => {
    const plugin = Plugin.getInstance('1234');
    plugin.setDisplayType(3);
    const msg = plugin.getAuthRequestTxG7();
    expect(slotByte(msg)).to.equal(0x03);
    expect(msg.byteSequence.length).to.equal(10);
    expect(msg.byteSequence[0]).to.equal(0x02);
  });

  it('rejects display types outside 1-3', () => {
    const plugin = Plugin.getInstance('1234');
    expect(() => plugin.setDisplayType(0)).to.throw(/display type/);
    expect(() => plugin.setDisplayType(4)).to.throw(/display type/);
  });

  it('is set from the Transmitter options', () => {
    const fake = makeG7Transmitter({ options: { displayType: 3 } });
    expect(slotByte(fake.transmitter.plugin.getAuthRequestTxG7())).to.equal(0x03);
  });

  it('is not carried over to a Transmitter created without one', () => {
    makeG7Transmitter({ options: { displayType: 3 } });
    const fake = makeG7Transmitter();
    expect(slotByte(fake.transmitter.plugin.getAuthRequestTxG7())).to.equal(0x02);
  });
});
