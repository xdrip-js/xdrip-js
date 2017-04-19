'use strict';

const express = require('express');
const socketIO = require('socket.io');
const path = require('path');

const PORT = process.env.PORT || 3000;
const INDEX = path.join(__dirname, 'index.html');

const server = express()
  .use((req, res) => res.sendFile(INDEX) )
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

const Transmitter = require('..');

const id = process.argv[2];
const transmitter = new Transmitter(id);

transmitter.on('glucose', console.log);
transmitter.on('error', console.error);





// // t1d
// const t1d = require('./t1d')();
//
// // cgm
// const cgm = require('./cgm')(t1d);
require('./transmitterIO')(io, transmitter);
//
// // pump
// const pump = require('./pump')(t1d);
// require('./pumpIO')(io, pump);
//
//
// setInterval(() => io.emit('time', new Date().toTimeString()), 1000);
