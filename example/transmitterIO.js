module.exports = (io, transmitter) => {
  let lastGlucose;

  transmitter.on('glucose', glucose => {
    lastGlucose = glucose;
    io.emit('glucose', glucose);
  });

  io.on('connection', (socket) => {
    socket.emit('id', transmitter.id);
    if (lastGlucose)
      socket.emit('glucose', lastGlucose);
  });
};
