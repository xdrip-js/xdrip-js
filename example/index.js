const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;

const server = express()
  .use(express.static('example/public'))
  .use('/node_modules', express.static('node_modules'))
  .use('/css', express.static('node_modules/bootstrap/dist/css')) // redirect CSS bootstrap
  // prevent error message on reloads as per https://stackoverflow.com/a/35284602
  .get('/*', function(req, res){
    res.sendFile(__dirname + '/public/index.html');
  })
  .listen(PORT, () => console.log(`Listening on ${ PORT }`));

const io = socketIO(server);

io.on('connection', (socket) => {
  console.log('Client connected');
  socket.on('disconnect', () => console.log('Client disconnected'));
});

const Transmitter = require('..');

// const id = process.argv[2];
// const transmitter = new Transmitter(id);
// TODO: persistence should be handled here, and we pass in the id to the transmitter
// something like this:
// let status = {};
// try {
//   status = require('../status');
// } catch (err) {}
// const id = status.id || '500000';
const transmitter = new Transmitter(id);

require('./transmitterIO')(io, transmitter);
