var should = require('chai').should;
var Glucose = require('../lib/glucose');
var TransmitterTimeRxMessage = require('../lib/messages/transmitter-time-rx-message');
var GlucoseRxMessage = require('../lib/messages/glucose-rx-message');
var CalibrationState = require('../lib/calibration-state');
var TransmitterStatus = require('../lib/transmitter-status');

describe('Glucose', function() {
  var timeMessage;
  var activationDate;

  before(function() {
    var data = Buffer.from('2500470272007cff710001000000fa1d', 'hex');
    timeMessage = new TransmitterTimeRxMessage(data);
    activationDate = new Date(2016, 10, 1);
  });

  it('should parse message data', function() {
    var data = Buffer.from('3100680a00008a715700cc0006ffc42a', 'hex');
    var message = new GlucoseRxMessage(data);
    var glucose = new Glucose(message, timeMessage, activationDate);
    glucose.status.should.equal(TransmitterStatus.ok);
    glucose.readDate.should.equal(new Date(2016, 12, 6, 7, 51, 38));
    glucose.sessionStartDate.should.equal(new Date(2016, 12, 26, 11, 16, 12));
    glucose.isDisplayOnly.should.be.false;
    glucose.glucose.should.equal(204);
    glucose.state.should.equal(CalibrationState.ok);
    glucose.trend.should.equal(-1);
  });
});
