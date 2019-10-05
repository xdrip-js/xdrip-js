const should = require('chai').should();
const SensorRxMessage = require('../lib/messages/sensor-rx-message');
const crc = require('../lib/crc');

describe('SensorRx', function() {
  describe('constructor', function() {
    it('should parse properly constructed G5/G6 SensorRxMessage data', function() {
      const data = Buffer.from("2f005ac55b006081010030790100482a", "hex");
      const message = new SensorRxMessage(data, false);
      message.status.should.equal(0);
      message.timestamp.should.equal(6014298);
      message.unfiltered.should.equal(98656);
      message.filtered.should.equal(96560);
    });

    it('should parse properly constructed G6+ SensorRxMessage data', function() {
      const data = Buffer.from("2f005ac55b00d9f2", "hex");
      const message = new SensorRxMessage(data, true);
      message.status.should.equal(0);
      message.timestamp.should.equal(6014298);
    });

    it('should throw if the first byte is not 0x2f', function() {
      (function() {
        const data = Buffer.from("00000000000000000000000000000000", "hex");
        const message = new SensorRxMessage(data);
      }).should.throw();
    });

    it('should throw if the message is not 16 bytes', function() {
      (function() {
        const data = Buffer.from("05", "hex");
        const message = new SensorRxMessage(data);
      }).should.throw();
    });
  });
});
