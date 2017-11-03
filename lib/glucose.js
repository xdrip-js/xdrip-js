const CalibrationState = require('./calibration-state');

//function Glucose(glucoseMessage, timeMessage, activationDate) {
function Glucose(glucoseMessage, timeMessage, syncDate, sensorMessage = null) {
  this.glucoseMessage = glucoseMessage;
  this.timeMessage = timeMessage;
//  this.syncDate = syncDate;
  this.status = glucoseMessage.status;
  this.state = glucoseMessage.state;
  this.readDate = syncDate + (glucoseMessage.timestamp - timeMessage.currentTime) * 1000;
  this.sessionStartDate = syncDate - (timeMessage.currentTime - timeMessage.sessionStartTime) * 1000;
  this.transmitterStartDate = syncDate - timeMessage.currentTime * 1000;
  // this.readDate = moment.utc(activationDate).add(glucoseMessage.timestamp, 's');
  // this.sessionStartDate = moment.utc(activationDate).add(timeMessage.sessionStartTime, 's');
  this.isDisplayOnly = glucoseMessage.glucoseIsDisplayOnly;
  this.filtered = sensorMessage ? sensorMessage.filtered / 1000 : null;
  this.unfiltered = sensorMessage ? sensorMessage.unfiltered / 1000 : null;
  this.glucose = CalibrationState.hasReliableGlucose(this.state) ? glucoseMessage.glucose : this.filtered; // still have to work out how to support different units here
  this.trend = glucoseMessage.trend;
  this.canBeCalibrated = CalibrationState.canBeCalibrated(this.state);
}

module.exports = Glucose;
