module.exports = (io, transmitter) => {
  let lastGlucose;
  console.log('instantiating transmitterIO');

  transmitter.on('glucose', glucose => {
    lastGlucose = glucose;
    console.log('got glucose: ' + glucose.glucose);
    io.emit('glucose', glucose);
  });

  io.on('connection', (socket) => {
    socket.emit('id', transmitter.id);
    if (lastGlucose)
      socket.emit('glucose', lastGlucose);
    socket.on('calibrate', (glucose) => {
      console.log('received calibration of ' + glucose);
    });
  });
};
