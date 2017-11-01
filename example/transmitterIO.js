const http = require("http");
const xDripAPS = require("./xDripAPS")();
const Transmitter = require('..');
const storage = require('node-persist');

module.exports = (io) => {

  // handle persistence here
  storage.init().then(() => {
    const dateNow = Date.now();
    // make fake glucose record
    const glucoseFakey = {
      syncDate: dateNow,
      status: 0,
      state: 6,
      readDate: dateNow,
      isDisplayOnly: false,
      filtered: 100000,
      unfiltered: 100000,
      glucose: 100,
      trend: 0,
      canBeCalibrated: true
    };
    storage.setItemSync('glucose', glucoseFakey);
    return storage.getItem('id');
  }).then(id => {
    console.log('got id of ' + id);
    id = id ? id : 500000;

    const transmitter = new Transmitter(id);

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
      });
      socket.on('id', id => {
        console.log('received id of ' + id);
        transmitter.id = id;
        storage.setItemSync('id', id);
        socket.emit('id', transmitter.id);
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
