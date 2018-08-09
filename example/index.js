/* eslint-disable no-console */
const Transmitter = require('..');

const id = process.argv[2];
const getMessages = () => [{
  date: Date(),
  type: 'BatteryStatus',
}];
const transmitter = new Transmitter(id, getMessages);

transmitter.on('glucose', glucose => console.log(`got glucose at ${glucose.readDate}: ${glucose.glucose}, filtered: ${glucose.filtered}, unfiltered: ${glucose.unfiltered}`));
transmitter.on('calibrationData', calibration => console.log(`calibration data: last calibrated at ${calibration.glucose} on ${calibration.date}`));
transmitter.on('batteryStatus', status => console.log(`battery status: ${status.status}, voltagea: ${status.voltagea}, voltageb: ${status.voltageb}`));

transmitter.on('disconnect', process.exit);
