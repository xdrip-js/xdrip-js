# xdrip-js

[![Join the chat at https://gitter.im/thebookins/xdrip-js](https://badges.gitter.im/thebookins/xdrip-js.svg)](https://gitter.im/thebookins/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/thebookins/xdrip-js.svg?branch=master)](https://travis-ci.org/thebookins/xdrip-js)

*Please note this project is neither created nor backed by Dexcom, Inc. This software is not intended for use in therapy.*

## Installation
```
npm install
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

To view the current status of the transmitter, open a browser and navigate to `http://<local IP address>:3000`. E.g. http://localhost:3000 or http://192.168.1.3:3000. This will vary depending on your local network setup.
