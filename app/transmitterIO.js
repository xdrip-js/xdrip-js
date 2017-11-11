const http = require("http");
const xDripAPS = require("./xDripAPS")();
const Transmitter = require('..');
const storage = require('node-persist');

module.exports = (io) => {

  // handle persistence here
  // make the storage direction relative to the install directory,
  // not the calling directory
  storage.init({dir: __dirname + '/storage'}).then(() => {
    return storage.getItem('id');
  })
  .then(id => {
    console.log('got id of ' + id);
    id = id ? id : '500000';

    const transmitter = new Transmitter(id);

    transmitter.getVersion()
    .then(version => {
      io.emit('version', version);
    });

    // hook up the tranmitter object
    transmitter.on('glucose', glucose => {
      console.log('got glucose: ' + glucose.glucose);
      storage.setItem('glucose', glucose)
      .then(() => {
        io.emit('glucose', glucose);
        xDripAPS.post(glucose);
      });
    });

    io.on('connection', (socket) => {
      // TODO: should this just be a 'data' message?
      // how do we initialise the connection with
      // all the data it needs?
      socket.emit('id', transmitter.id);
      storage.getItem('glucose')
      .then(glucose => {
        if (glucose) {
          socket.emit('glucose', glucose);
        }
      });
      storage.getItem('calibration')
      .then(calibration => {
        if (calibration) {
          socket.emit('calibration', calibration);
        }
      });
      socket.on('startSensor', () => {
        console.log('received startSensor command');
        transmitter.startSensor();
      });
      socket.on('stopSensor', () => {
        console.log('received stopSensor command');
      });
      socket.on('calibrate', glucose => {
        console.log('received calibration of ' + glucose);
        transmitter.calibrate(glucose);
        // const pending = transmitter.calibrate(glucose);
        // storage.setItemSync('calibration', pending);
        // io.emit('calibration', pending);
      });
      socket.on('id', id => {
        console.log('received id of ' + id);
        transmitter.id = id;
        storage.setItemSync('id', id);
        // TODO: clear glucose on new id
        // use io.emit rather than socket.emit
        // since we want to nofify all connections
        io.emit('id', id);
        // const status = {id};
        // console.log(JSON.stringify(status));
        // fs.writeFile(__dirname + '/status.json', JSON.stringify(status), (err) => {
        //   if (err) {
        //     console.error(err);
        //     return;
        //   }
        //   console.log("File has been created");
        // });
      });
    });

  });
  // let status = {};
  // try {
  //   status = require('./status');
  // } catch (err) {}
  // const id = status.id || '500000';

};
