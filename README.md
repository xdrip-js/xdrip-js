# xdrip-js

[![Join the chat at https://gitter.im/thebookins/xdrip-js](https://badges.gitter.im/thebookins/xdrip-js.svg)](https://gitter.im/thebookins/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/thebookins/xdrip-js.svg?branch=master)](https://travis-ci.org/thebookins/xdrip-js)

*Please note this project is neither created nor backed by Dexcom, Inc. This software is not intended for use in therapy.*
## Prerequisites
Update node version. Please see wiki page for instructions https://github.com/thebookins/xdrip-js/wiki

## Installation
```
cd ~/src
git clone https://github.com/thebookins/xdrip-js.git
cd xdrip-js
sudo npm install
```
## Testing
```
npm test
```

## Example usage
`sudo node example <######>` where `<######>` is the 6-character serial number of the transmitter.

To see verbose output, use `sudo DEBUG=* node example <######>`, or replace the `*` with a comma separated list of the modules you would like to debug. E.g. `sudo DEBUG=smp,transmitter,bluetooth-manager node example <######>`.

`bluetoothctl` is used to accept the incoming pairing request. From a command prompt, enter `bluetoothctl` and then enter the following commands (some may not be necessary depending on your configuration):
 - `agent off`
 - `agent KeyboardDisplay`
 - `default-agent`
 - `pairable on`
 - `power on`

When the transmitter is found, type 'yes' to accept the pairing request:
![pairing](https://user-images.githubusercontent.com/12263040/29741707-29713598-8ab5-11e7-8a0a-73a7202e3dbd.png)

To view the current status of the transmitter, open a browser and navigate to `http://<local IP address>:3000`. E.g. http://localhost:3000 or http://192.168.1.3:3000. This will vary depending on your local network setup.
![app](https://user-images.githubusercontent.com/12263040/29741914-36d4bfe4-8ab9-11e7-891e-6c23263db499.png)

## One-shot mode additional installation steps
If you want xdrip-js to connect to the transmitter, wait for the first bg, then exit, you will need to follow these additional installation steps. This mode is useful if you have an issue with disconnecting sensors. Doing it one-shot at a time seems to make it more reliable in this case.

```
sudo apt-get install bluez-tools
cd ~/src/xdrip-js
chmod 755 xdrip-get-entries.sh post-ns.sh post-xdripAPS.sh
```

Add cron job entry (replace "40SNU6" with your g5 transmitter id) ...
```
* * * * * cd /root/src/xdrip-js && ps aux | grep -v grep | grep -q 'xdrip-get-entries' || ./xdrip-get-entries.sh 40SNU6 | tee -a /var/log/openaps/xdrip-js-loop.log
```

Edit ~/src/xdrip-js/example/transmitterIO.js and add the following (need to replace this with an xdrip-js one-shot cmd-line options):

```
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
```
