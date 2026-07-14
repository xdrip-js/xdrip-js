const should = require('chai').should();
const BatteryStatusRxMessage = require('../lib/messages/g6/battery-status-rx-message');

describe('BatteryStatusMessage', () => {
  describe('constructor', () => {
    it('should parse properly constructed G7 BatteryStatusRxMessage data', () => {
      const data = Buffer.from('22002001f8000a220000000001', 'hex');
      const message = new BatteryStatusRxMessage(data);
      message.status.should.equal(0);
      message.voltagea.should.equal(288);
      message.voltageb.should.equal(248);
      message.resist.should.equal(8714);
      message.runtime.should.equal(0);
      message.temperature.should.equal(0);
    });

    it('should throw if the first byte is not 0x5', () => {
      (function () {
        const data = Buffer.from('000000', 'hex');
        const message = new AuthStatusRxMessage(data);
      }).should.throw();
    });

    it('should throw if the message is shorter than three bytes', () => {
      (function () {
        const data = Buffer.from('05', 'hex');
        const message = new AuthStatusRxMessage(data);
      }).should.throw();
    });
  });
});
