var should = require('chai').should()
var GlucoseRxMessage = require('../lib/messages/glucose-rx-message')

describe('GlucoseRxMessage', function() {
    it('should parse message data', function() {
        var data = Buffer.from("3100680a00008a715700cc0006ffc42a", "hex")
        var message = new GlucoseRxMessage(data);
        message.status.should.equal(0);
        message.sequence.should.equal(2664);
        message.timestamp.should.equal(5730698);
        message.glucoseIsDisplayOnly.should.be.false;
        message.glucose.should.equal(204);
        message.state.should.equal(6);
        message.trend.should.equal(-1);
    });

    it('should parse a negative trend');
    it('should parse display only');
    it('should handle an old transmitter');
  });
});
