const CalibrationState = require('./calibration-state');
const moment = require('moment');

//function Glucose(glucoseMessage, timeMessage, activationDate) {
function Glucose(glucoseMessage, timeMessage, syncDate) {
  this.glucoseMessage = glucoseMessage;
  this.timeMessage = timeMessage;
  this.syncDate = syncDate;
  this.status = glucoseMessage.status;
  this.state = glucoseMessage.state;
  this.readDate = syncDate + (glucoseMessage.timestamp - timeMessage.currentTime) * 1000;
  // this.readDate = moment.utc(activationDate).add(glucoseMessage.timestamp, 's');
  // this.sessionStartDate = moment.utc(activationDate).add(timeMessage.sessionStartTime, 's');
  this.isDisplayOnly = glucoseMessage.glucoseIsDisplayOnly;
  this.glucose = CalibrationState.hasReliableGlucose(this.state) ? glucoseMessage.glucose : null; // still have to work out how to support different units here
  this.trend = glucoseMessage.trend;
}

module.exports = Glucose;
