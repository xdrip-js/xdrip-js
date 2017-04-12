var Transmitter = require('..');

var id = process.argv[2];
var transmitter = new Transmitter(id);

transmitter.on('glucose', console.log)
transmitter.on('error', console.error)
