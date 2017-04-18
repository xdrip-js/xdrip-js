module.exports = {
  stopped: 1,
  warmup: 2,
  needFirstInitialCalibration: 4,
  needSecondInitialCalibration: 5,
  ok: 6,
  needCalibration: 7,
  hasReliableGlucose: function(state) {
    return (state === 6) || (state === 7);
  }
}
