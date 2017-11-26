CalibrationState = {
  stopped: 0x01,
  warmup: 0x02,
  needFirstInitialCalibration: 0x04,
  needSecondInitialCalibration: 0x05,
  ok: 0x06,
  needCalibration: 0x07,
  enterNewBG: 0x0a,
  sensorFailed: 0x0b,
  questionMarks: 0x0c,
  somethingElseCouldBeCalibrateAgain: 0x0e,
  unknown: 0x12
};

CalibrationState.hasReliableGlucose = function(state) {
  return (state === CalibrationState.ok) || (state === CalibrationState.needCalibration);
};

CalibrationState.canBeCalibrated = function(state) {
  return (state === CalibrationState.needFirstInitialCalibration) ||
    (state === CalibrationState.needSecondInitialCalibration) ||
    (state === CalibrationState.ok) ||
    (state === CalibrationState.needCalibration) ||
    (state === CalibrationState.enterNewBG);
};

module.exports = CalibrationState;
