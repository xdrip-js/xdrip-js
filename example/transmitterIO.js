const http = require("http");

module.exports = (io, transmitter) => {
  let lastGlucose;

  transmitter.on('glucose', glucose => {
    lastGlucose = glucose;
    console.log('got glucose: ' + glucose.glucose);
    io.emit('glucose', glucose);

    // TODO: move this xDripAPS POST code to another file or function
    const entry = [{
      'device': 'DexcomR4',
      'date': glucose.readDate,
      'dateString': new Date(glucose.readDate).toISOString(),
      'sgv': glucose.glucose,
      'direction': 'None',
      'type': 'sgv',
      'filtered': glucose.filtered,
      'unfiltered': glucose.unfiltered,
      'rssi': "100", // TODO: consider reading this on connection and reporting
      'noise': "1",
      'trend': glucose.trend,
      'xDrip_raw': glucose.glucose, // TODO: is this needed? not sure where (if) it is used
      'glucose': glucose.glucose
    }];

    const data = JSON.stringify(entry);
    const secret = process.env.API_SECRET;

    const options = {
      hostname: '127.0.0.1', // could also try localhost ?
      port: 5000,
      path: '/api/v1/entries',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
        'API-SECRET': secret
      }
    };

    const req = http.request(options);

    // const req = http.request(options, function(res) {
    //   // console.log('Status: ' + res.statusCode);
    //   // console.log('Headers: ' + JSON.stringify(res.headers));
    //   res.setEncoding('utf8');
    //   // res.on('data', function (body) {
    //   //   console.log('Body: ' + body);
    //   // });
    // });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });

    req.write(data);
    req.end();
  });

  io.on('connection', (socket) => {
    socket.emit('id', transmitter.id);
    if (lastGlucose)
      socket.emit('glucose', lastGlucose);
    socket.on('startSensor', () => {
      console.log('received startSensor command');
      transmitter.startSensor();
    });
    socket.on('stopSensor', () => {
      console.log('received stopSensor command');
    });
    socket.on('calibrate', (glucose) => {
      console.log('received calibration of ' + glucose);
      transmitter.calibrate(glucose);
    });
  });
};
