const CalibrationState = require('./calibration-state');

function Glucose(glucoseMessage, timeMessage, activationDate, sensorMessage = null, rssi = null) {
  this.inSession = timeMessage.sessionStartTime !== 0xffffffff;
  this.glucoseMessage = glucoseMessage;
  this.timeMessage = timeMessage;
  this.status = glucoseMessage.status;
  this.state = glucoseMessage.state;
  this.transmitterStartDate = activationDate;
  this.sessionStartDate = this.inSession
    ? new Date(activationDate.getTime() + timeMessage.sessionStartTime * 1000)
    : null;
  this.readDate = new Date(activationDate.getTime() + glucoseMessage.timestamp * 1000);
  this.isDisplayOnly = glucoseMessage.glucoseIsDisplayOnly;
  this.filtered = sensorMessage ? sensorMessage.filtered : null;
  this.unfiltered = sensorMessage ? sensorMessage.unfiltered : null;
  this.glucose = CalibrationState.hasReliableGlucose(this.state)
    ? glucoseMessage.glucose
    : null;
  this.trend = glucoseMessage.trend;
  this.canBeCalibrated = CalibrationState.canBeCalibrated(this.state);
  this.rssi = rssi;
}

module.exports = Glucose;
