const CalibrationState = {
  stopped: 0x01,
  warmup: 0x02,
  need1stInitialCalibration: 0x04,
  need2ndInitialCalibration: 0x05,
  ok: 0x06,
  needCalibration: 0x07,
  enterNewBG: 0x0a,
  sensorFailed: 0x0b,
  somethingElseCouldBeCalibrateAgain: 0x0e,
  questionMarks: 0x12,
};

CalibrationState.hasReliableGlucose = (state) => (state === CalibrationState.ok)
  || (state === CalibrationState.needCalibration);

CalibrationState.canBeCalibrated = (state) => (state === CalibrationState.need1stInitialCalibration)
  || (state === CalibrationState.need2ndInitialCalibration)
  || (state === CalibrationState.ok)
  || (state === CalibrationState.needCalibration)
  || (state === CalibrationState.enterNewBG);

module.exports = Object.freeze(CalibrationState);
