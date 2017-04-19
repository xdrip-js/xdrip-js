const CalibrationState = require('./calibration-state');
const moment = require('moment');

function Glucose(glucoseMessage, timeMessage, activationDate) {
  this.glucoseMessage = glucoseMessage;
  this.timeMessage = timeMessage;
  this.status = glucoseMessage.status; // or new TransmitterStatus(glucoseMessage.status);
  this.state = glucoseMessage.state; // or new CalibrationState(glucoseMessage.state);
  this.sessionStartDate = moment.utc(activationDate).add(timeMessage.sessionStartTime, 's');
  console.log(moment.utc(activationDate).add(timeMessage.sessionStartTime, 's').format());
  this.readDate = moment.utc(activationDate).add(glucoseMessage.timestamp, 's');
  console.log(moment.utc(activationDate).add(glucoseMessage.timestamp, 's').format());
  this.isDisplayOnly = glucoseMessage.glucoseIsDisplayOnly;
  this.glucose = CalibrationState.hasReliableGlucose(this.state) ? glucoseMessage.glucose : null; // still have to work out how to support different units here
  this.trend = glucoseMessage.trend;
}

module.exports = Glucose;
