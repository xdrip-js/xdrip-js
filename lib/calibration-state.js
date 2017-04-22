CalibrationState = {
  stopped: 1,
  warmup: 2,
  needFirstInitialCalibration: 4,
  needSecondInitialCalibration: 5,
  ok: 6,
  needCalibration: 7,
  questionMarks: 0x12
};

CalibrationState.hasReliableGlucose = function(state) {
  return (state === CalibrationState.ok) || (state === CalibrationState.needCalibration);
};

module.exports = CalibrationState;
