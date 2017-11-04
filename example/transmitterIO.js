const http = require("http");
const xDripAPS = require("./xDripAPS")();

module.exports = (io, transmitter) => {
  let lastGlucose;

  transmitter.on('glucose', glucose => {
    lastGlucose = glucose;
    console.log('got glucose: ' + glucose.glucose);

    io.emit('glucose', glucose);
    xDripAPS.post(glucose);
  });

  io.on('connection', (socket) => {
    socket.emit('id', transmitter.id);
    if (lastGlucose)
      socket.emit('glucose', lastGlucose);
    socket.on('startSensor', () => {
      console.log('received startSensor command');
      transmitter.startSensor();
    });
    socket.on('stopSensor', () => {
      console.log('received stopSensor command');
    });
    socket.on('calibrate', (glucose) => {
      console.log('received calibration of ' + glucose);
      transmitter.calibrate(glucose);
    });
  });
};
