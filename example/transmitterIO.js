const http = require("http");

module.exports = (io, transmitter) => {
  let lastGlucose;

  transmitter.on('glucose', glucose => {
    lastGlucose = glucose;
    console.log('got glucose: ' + glucose.glucose);
    console.log('about to call io.emit');
    io.emit('glucose', glucose);
    console.log('about to craft entry');

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
      'rssi': 100,
      'noise': 1,
      'trend': glucose.trend,
      'xDrip_raw': glucose.glucose,
      'glucose': glucose.glucose
    }];

    console.log('entry = ' + entry);

    const secret = process.env.API_SECRET;
    console.log('API secret = ' + secret);

    const options = {
      hostname: '127.0.0.1', // could also try localhost ?
      port: 5000,
      path: '/api/v1/entries',
      method: 'POST',
      headers: {
        'API-SECRET': secret,
        'Content-Type': 'application/json',
      }
    };

    const req = http.request(options, function(res) {
      console.log('Status: ' + res.statusCode);
      console.log('Headers: ' + JSON.stringify(res.headers));
      res.setEncoding('utf8');
      res.on('data', function (body) {
        console.log('Body: ' + body);
      });
    });

    req.on('error', function(e) {
      console.log('problem with request: ' + e.message);
    });

    // write data to request body
    data = JSON.stringify(entry);
    console.log("about to send data: " + data);

    req.write(data);

    req.end();
  });

  io.on('connection', (socket) => {
    socket.emit('id', transmitter.id);
    if (lastGlucose)
      socket.emit('glucose', lastGlucose);
    socket.on('calibrate', (glucose) => {
      console.log('received calibration of ' + glucose);
    });
  });
};
