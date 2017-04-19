var should = require('chai').should;

var Glucose = require('../lib/glucose');
var TransmitterTimeRxMessage = require('../lib/messages/transmitter-time-rx-message');
var GlucoseRxMessage = require('../lib/messages/glucose-rx-message');
var CalibrationState = require('../lib/calibration-state');
var TransmitterStatus = require('../lib/transmitter-status');

describe('Glucose', function() {
  var timeMessage;
  var syncDate;

  before(function() {
    var data = Buffer.from('2500470272007cff710001000000fa1d', 'hex');
    timeMessage = new TransmitterTimeRxMessage(data);
//    activationDate = new Date(2016, 10, 1);
//    syncDate = moment.utc({y: 2016, M: 9, d: 1});
    syncDate = Date.UTC(2016, 6, 17); // 17 July 2016 (months are 0 - 11)

//    console.log(activationDate);
  });

  it('should parse message data', function() {
    var data = Buffer.from('3100680a00008a715700cc0006ffc42a', 'hex');
    var message = new GlucoseRxMessage(data);
    var glucose = new Glucose(message, timeMessage, syncDate);
    glucose.status.should.equal(TransmitterStatus.ok);
    glucose.state.should.equal(CalibrationState.ok);
    // there are 1740989 seconds between the glucose timestamp and the current time in the above hex strings
    glucose.readDate.should.equal(syncDate - 1740989 * 1000);
    glucose.isDisplayOnly.should.be.false;
    glucose.glucose.should.equal(204);
    glucose.trend.should.equal(-1);
  });
});
