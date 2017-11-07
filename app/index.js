const express = require('express');
const socketIO = require('socket.io');

const PORT = process.env.PORT || 3000;

// bad hack - can't work out how to set this from crontab
// TODO: fix this
process.env.DEBUG = 'transmitter'

const server = express()
  .use(express.static('app/public'))
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

require('./transmitterIO')(io);
