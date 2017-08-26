CalibrationState = {
  stopped: 0x01,
  warmup: 0x02,
  needFirstInitialCalibration: 0x04,
  needSecondInitialCalibration: 0x05,
  ok: 0x06,
  needCalibration: 0x07,
  unknownState1: 0x0b,
  questionMarks: 0x0c,
  unknownState2: 0x12
};

CalibrationState.hasReliableGlucose = function(state) {
  return (state === CalibrationState.ok) || (state === CalibrationState.needCalibration);
};

module.exports = CalibrationState;
