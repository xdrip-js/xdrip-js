const storage = require('node-persist');

storage.init().then(() => {
  const dateNow = Date.now();

  storage.setItemSync('id', '40ABCD');

  // fake a calibration
  const calibFakey = {
    time: dateNow,
    glucose: 123
  };
  storage.setItemSync('calibration', calibFakey);

  // fake a glucose record
  const glucoseFakey = {
    status: 0,
    state: 6,
    readDate: dateNow,
    sessionStartDate: dateNow - 3*24*60*60*1000,
    transmitterStartDate: dateNow - 76*24*60*60*1000,
    isDisplayOnly: false,
    filtered: 100000,
    unfiltered: 100000,
    glucose: 100,
    trend: 0,
    canBeCalibrated: true
  };
  storage.setItemSync('glucose', glucoseFakey);
});
