const { expect } = require('chai');

const GlucoseTxMessage = require('../lib/messages/glucose-tx-message');

// xDrip+ Ob1G5StateMachine asks a G7 (short tx id) for glucose with
// EGlucoseTxMessage(small = true): the single byte 0x4e, no CRC. A G7 (and
// g7sim) ignores the G5 request 0x30 + CRC (seen over the air).
describe('GlucoseTxMessage', () => {
  it('is 0x30 + CRC for G5', () => {
    expect(new GlucoseTxMessage(false).data.toString('hex')).to.equal('305336');
  });

  it('is 0x4e + CRC for G6', () => {
    const d = new GlucoseTxMessage(true).data;
    expect(d.length).to.equal(3);
    expect(d[0]).to.equal(0x4e);
  });

  it('is the single byte 0x4e for G7', () => {
    expect(new GlucoseTxMessage(false, true).data.toString('hex')).to.equal('4e');
  });
});
