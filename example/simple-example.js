const Transmitter = require('xdrip-js');

const id = process.argv[2];
const transmitter = new Transmitter(id);

transmitter.on('glucose', glucose => {
  console.log('got glucose: ' + glucose.glucose);
});

transmitter.on('disconnect', process.exit);
