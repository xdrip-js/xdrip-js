const http = require("http");
const os = require("os");

module.exports = () => {
  return {
    // API (public) functions
    post: (glucose) => {
      // log error and ignore errant glucose values
      if (glucose.glucose > 800 || glucose.glucose < 20) {
        console.log('Invalid glucose value received from transmitter, ignoring');
        return;
      }

      const entry = [{
        'device': 'openaps://' + os.hostname(),
        'date': glucose.readDate,
        'dateString': new Date(glucose.readDate).toISOString(),
        'sgv': Math.round(glucose.glucose),
        'direction': 'None',
        'type': 'sgv',
        'filtered': glucose.filtered,
        'unfiltered': glucose.unfiltered,
        'rssi': "100", // TODO: consider reading this on connection and reporting
        'noise': "1",
        'trend': glucose.trend,
        'glucose': Math.round(glucose.glucose)
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

      req.on('error', function(e) {
        console.log('problem with request: ' + e.message);
      });

      req.write(data);
      req.end();
    }
  };
};
