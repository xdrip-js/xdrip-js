const Transmitter = require('..');

const id = process.argv[2];
const transmitter = new Transmitter(id);

transmitter.on('glucose', glucose => {
  //console.log('got glucose: ' + glucose.glucose);
  lastGlucose = glucose;
  var d= new Date(glucose.readDate);
  var fs = require('fs');
  const entry = [{
      'device': 'DexcomR4',
      'date': glucose.readDate,
      'dateString': new Date(glucose.readDate).toISOString(),
      'sgv': Math.round(glucose.unfiltered),
      'direction': 'None',
      'type': 'sgv',
      'filtered': Math.round(glucose.filtered),
      'unfiltered': Math.round(glucose.unfiltered),
      'rssi': "100", // TODO: consider reading this on connection and reporting
      'noise': "1",
      'trend': glucose.trend,
      'glucose': Math.round(glucose.glucose)
    }];
    const data = JSON.stringify(entry);

  if(glucose.unfiltered > 500 || glucose.unfiltered < 30) // for safety, I'm assuming it is erroneous and ignoring
    {
      console.log("Error - bad glucose data, not processing");
      process.exit();
    }
    fs.writeFile("entry.json", data, function(err) {
    if(err) {
        console.log("Error while writing entry-test.json");
        console.log(err);
        }
    process.exit();
    }); 
});

transmitter.on('disconnect', process.exit);
