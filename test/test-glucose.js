var should = require('chai').should;
var moment = require('moment');

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
//    activationDate = new Date(2016, 10, 1);
    activationDate = moment.utc({y: 2016, M: 9, d: 1});
    console.log(activationDate);
  });

  it('should parse message data', function() {
    var data = Buffer.from('3100680a00008a715700cc0006ffc42a', 'hex');
    var message = new GlucoseRxMessage(data);
    var glucose = new Glucose(message, timeMessage, activationDate);
    glucose.status.should.equal(TransmitterStatus.ok);
//    glucose.readDate.should.equal(new Date(2016, 12, 6, 7, 51, 38));
    glucose.readDate.format().should.equal(moment.utc({y: 2016, M: 11, d: 6, h: 7, m: 51, s: 38}).format());
//    glucose.readDate.should.equal(new moment({y: 2016, M: 9, d: 2}));
//    glucose.sessionStartDate.should.equal(new Date(2016, 12, 26, 11, 16, 12));
    glucose.sessionStartDate.format().should.equal(moment.utc({y: 2016, M: 11, d: 26, h: 11, m: 16, s: 12}).format());
    glucose.isDisplayOnly.should.be.false;
    glucose.glucose.should.equal(204);
    glucose.state.should.equal(CalibrationState.ok);
    glucose.trend.should.equal(-1);
  });
});
