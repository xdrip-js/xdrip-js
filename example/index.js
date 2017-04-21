const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;

const server = express()
  .use(express.static('example/public'))
  .use('/node_modules', express.static('node_modules'))
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

const Transmitter = require('..');

const id = process.argv[2];
const transmitter = new Transmitter(id);

require('./transmitterIO')(io, transmitter);
