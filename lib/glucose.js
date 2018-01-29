const CalibrationState = require('./calibration-state');

//function Glucose(glucoseMessage, timeMessage, activationDate) {
function Glucose(glucoseMessage, timeMessage, syncDate, sensorMessage = null) {
  this.inSession = timeMessage.sessionStartTime != 0xffffffff;
  this.glucoseMessage = glucoseMessage;
  this.timeMessage = timeMessage;
  this.status = glucoseMessage.status;
  this.state = glucoseMessage.state;
  this.transmitterStartDate = syncDate - timeMessage.currentTime * 1000;
  this.sessionStartDate = this.inSession ?
    this.transmitterStartDate + timeMessage.sessionStartTime * 1000 :
    null;
  this.readDate = this.transmitterStartDate + glucoseMessage.timestamp * 1000;
  this.isDisplayOnly = glucoseMessage.glucoseIsDisplayOnly;
  this.filtered = sensorMessage ? sensorMessage.filtered : null;
  this.unfiltered = sensorMessage ? sensorMessage.unfiltered : null;
  this.glucose = CalibrationState.hasReliableGlucose(this.state) ? glucoseMessage.glucose : null; // still have to work out how to support different units here
  this.trend = glucoseMessage.trend;
  this.canBeCalibrated = CalibrationState.canBeCalibrated(this.state);
}

module.exports = Glucose;
