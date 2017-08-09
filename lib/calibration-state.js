CalibrationState = {
  stopped: 0x1,
  warmup: 0x2,
  needFirstInitialCalibration: 0x4,
  needSecondInitialCalibration: 0x5,
  ok: 0x6,
  needCalibration: 0x7,
  needCalibration: 0xb,
  questionMarks: 0xc
};

CalibrationState.hasReliableGlucose = function(state) {
  return (state === CalibrationState.ok) || (state === CalibrationState.needCalibration);
};

module.exports = CalibrationState;
