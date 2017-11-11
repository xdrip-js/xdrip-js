#!/usr/bin/env node

const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;

console.log(__dirname);
const server = express()
  .use(express.static(__dirname + '/public'))
  // note: the '/../node_modules' bit is because the app
  // doesn't have its own packge.json file
  // could be an idea to separate the app out as a separate repo
  .use('/node_modules', express.static(__dirname + '/../node_modules'))
  .use('/css', express.static(__dirname + '/../node_modules/bootstrap/dist/css')) // redirect CSS bootstrap
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

const argv = require('yargs').argv;
const TransmitterIO = argv.sim ? require('./transmitterIO-simulated') : require('./transmitterIO')

TransmitterIO(io);
