const chai = require('chai');
chai.use(require('chai-datetime'));

const should = chai.should();

const Glucose = require('../lib/glucose');
const TransmitterTimeRxMessage = require('../lib/messages/transmitter-time-rx-message');
const GlucoseRxMessage = require('../lib/messages/glucose-rx-message');
const CalibrationState = require('../lib/calibration-state');

TransmitterStatus = {
  ok: 0,
  lowBattery: 0x81,
  bricked: 0x83,
};

describe('GlucoseRxMessage', () => {
  let timeMessage;
  let syncDate;

  before(() => {
    const data = Buffer.from('2500470272007cff710001000000fa1d', 'hex');
    timeMessage = new TransmitterTimeRxMessage(data);
    syncDate = Date.UTC(2026, 6, 17); // 17 July 2016 (months are 0 - 11)
    activationDate = new Date(syncDate - timeMessage.currentTime * 1000);

    //    console.log(activationDate);
  });

  it('should parse g5 message data', () => {
    const data = Buffer.from('3100680a00008a715700cc0006ffc42a', 'hex');
    const message = new GlucoseRxMessage(data);
    message.status.should.equal(0);
    message.sequence.should.equal(2664);
    message.timestamp.should.equal(5730698);
    message.glucoseIsDisplayOnly.should.be.false;
    message.glucose.should.equal(204);
    message.state.should.equal(6);
    message.trend.should.equal(-1);
  });

  it('should parse g6 message data', () => {
    const data = Buffer.from('4f00d92900004e423200520006ff4e00989a', 'hex');
    const message = new GlucoseRxMessage(data);
    const glucose = new Glucose(message, timeMessage, activationDate);
    glucose.status.should.equal(TransmitterStatus.ok);
    glucose.state.should.equal(CalibrationState.ok);
    // there are 1740989 seconds between the glucose timestamp and the current time in the above hex strings
    glucose.readDate.should.equalDate(new Date(syncDate - 4177913 * 1000));
    glucose.isDisplayOnly.should.be.false;
    glucose.glucose.should.equal(82);
    glucose.trend.should.equal(-1);
  });

  it('should parse g7 message data', () => {
    const data = Buffer.from('4e0006e10d00da0b00014e00670006fe65000f', 'hex');
    const message = new GlucoseRxMessage(data);
    message.sequence.should.equal(3034);
    message.timestamp.should.equal(909574);
    message.age.should.equal(78);
    message.glucoseIsDisplayOnly.should.be.false;
    message.glucose.should.equal(103);
    message.state.should.equal(6);
    message.trend.should.equal(-2);
  });
});
