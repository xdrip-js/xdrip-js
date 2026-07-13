const chai = require('chai');
chai.use(require('chai-datetime'));

const should = chai.should();

const Glucose = require('../lib/glucose');
const TransmitterTimeRxMessage = require('../lib/messages/transmitter-time-rx-message');
const GlucoseRxMessage = require('../lib/messages/glucose-rx-message');
const CalibrationState = require('../lib/calibration-state');
const TransmitterStatus = require('../lib/transmitter-status');

describe('Glucose', () => {
  let timeMessage;
  let syncDate;

  before(() => {
    const data = Buffer.from('2500470272007cff710001000000fa1d', 'hex');
    timeMessage = new TransmitterTimeRxMessage(data);
    syncDate = Date.UTC(2026, 6, 17); // 17 July 2016 (months are 0 - 11)
    activationDate = new Date(syncDate - timeMessage.currentTime * 1000);

    //    console.log(activationDate);
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
    const data = Buffer.from('4e00dba00c00c90a00010f009300060196000f', 'hex');
    const message = new GlucoseRxMessage(data);
    console.log(JSON.stringify(message, null, 2));
  });
});
