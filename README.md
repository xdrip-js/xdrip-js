# xdrip-js

[![Join the chat at https://gitter.im/xdrip-js/xdrip-js](https://badges.gitter.im/xdrip-js/xdrip-js.svg)](https://gitter.im/xdrip-js/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
[![Build Status](https://travis-ci.org/xdrip-js/xdrip-js.svg?branch=master)](https://travis-ci.org/xdrip-js/xdrip-js)

*Please note this project is neither created nor backed by Dexcom, Inc. This software is not intended for use in therapy.*
## Prerequisites
Update node version. Please see wiki page for instructions https://github.com/xdrip-js/xdrip-js/wiki

## Clients
See [Lookout](https://github.com/xdrip-js/Lookout) or [Logger](https://github.com/xdrip-js/Logger) for two examples of applications built using this library.

## Installation
```
cd ~/src
git clone https://github.com/xdrip-js/xdrip-js.git
cd xdrip-js
sudo npm install
```
## Testing
```
npm test
```

## Usage

### Example
`sudo node example <######>` where `<######>` is the 6-character serial number of the transmitter.

To see verbose output, use `sudo DEBUG=* node example <######>`, or replace the `*` with a comma separated list of the modules you would like to debug. E.g. `sudo DEBUG=smp,transmitter,bluetooth-manager node example <######>`.

### Events

See [Node.js EventEmitter docs](https://nodejs.org/api/events.html) for more info on the event API.

#### Glucose read event

```javascript
glucose = {
  inSession: <bool>,
  glucoseMessage: {
    status: <0: "ok" | 0x81: "lowBattery" | 0x83: "bricked">,
    sequence: <int>, // increments for each glucose value read
    timestamp: <int>, // in seconds since transmitter start
    glucoseIsDisplayOnly: <bool>,
    glucose: <int>, // in mg/dl
    state: <int>, // calibration state
    trend: <int>
  },
  timeMessage: {
    status: <0: "ok" | 0x81: "lowBattery" | 0x83: "bricked">,
    currentTime: <int>, // in seconds since transmitter start
    sessionStartTime: <int> // in seconds since transmitter start
  },
  status: <0: "ok" | 0x81: "lowBattery" | 0x83: "bricked">,
  state: <int>, // calibration state
  transmitterStartDate: <int>, // epoch time
  sessionStartDate: <int>, // epoch time
  readDate: <int>, // epoch time
  isDisplayOnly: <bool>,
  filtered: <float>, // mg/dl
  unfiltered: <float>, // mg/dl
  glucose: <int>, // mg/dl
  trend: <int>,
  canBeCalibrated: <bool>
}

transmitter.on('glucose', callback(glucose));
```

#### Message processed

```javascript
details = {
  time: <int> // epoch time
}

transmitter.on('messageProcessed', callback(details));
```

#### Calibration data
```javascript
calibrationData = {
  date: <int>, // epoch time
  glucose: <int> //mg/dl
};
transmitter.on('calibrationData', callback(calibrationData));
```

#### Transmitter disconnected

```javascript
transmitter.on('disconnect', callback);
```
