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
      'date': glucose.readDate.toString(),
      'dateString': new Date(glucose.readDate).toISOString(),
      'sgv': glucose.glucose,
      'direction': 'None',
      'type': 'sgv',
      'filtered': '100', //glucose.filtered.toString(),
      'unfiltered': '100', //glucose.unfiltered.toString(),
      'rssi': "100",
      'noise': "1",
      'trend':'0', //glucose.trend.toString(),
      'xDrip_raw': '100', //glucose.glucose.toString(),
      'glucose': '100' //glucose.glucose.toString()
    }];

    console.log('entry = ' + entry);

    data = JSON.stringify(entry);

    const secret = process.env.API_SECRET;
    console.log('API secret = ' + secret);

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
