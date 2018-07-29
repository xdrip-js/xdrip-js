/* eslint-disable no-console */
const Transmitter = require('..');

const id = process.argv[2];
const transmitter = new Transmitter(id);

transmitter.on('glucose', glucose => console.log(`got glucose: ${glucose.glucose}, filtered: ${glucose.filtered}, unfiltered: ${glucose.unfiltered}`));
transmitter.on('calibrationData', calibration => console.log(`got calibrationData: ${calibration}`));

transmitter.on('disconnect', process.exit);
