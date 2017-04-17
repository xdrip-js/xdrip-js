function Glucose(glucoseMessage, timeMessage, activationDate) {
  this.glucoseMessage = glucoseMessage;
  this.timeMessage = timeMessage;
  this.status = glucoseMessage.status; // or new TransmitterStatus(glucoseMessage.status);
  this.state = glucoseMessage.state; // or new CalibrationState(glucoseMessage.state);
  this.sessionStartDate = 0; //activationDate.addingTimeInterval(TimeInterval(timeMessage.sessionStartTime))
  this.readDate = 0; //activationDate.addingTimeInterval(TimeInterval(glucoseMessage.timestamp))
  this.isDisplayOnly = glucoseMessage.glucoseIsDisplayOnly;
  this.glucose = state.hasReliableGlucose ? glucoseMessage.glucose : null; // still have to work out how to support different units here
  this.trend = glucoseMessage.trend;
}

module.exports = Glucose;
