module.exports = (io, transmitter) => {
  const nsp = io.of('/cgm');
  transmitter.on('glucose', message => nsp.emit('glucose', message));

  nsp.on('connection', (socket) => {
    socket.emit('id', transmitter.id);
  })
}
