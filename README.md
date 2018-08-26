# xdrip-js

[![Join the chat at https://gitter.im/thebookins/xdrip-js](https://badges.gitter.im/thebookins/xdrip-js.svg)](https://gitter.im/thebookins/xdrip-js?utm_source=badge&utm_medium=badge&utm_campaign=pr-badge&utm_content=badge)
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
    status: <0: "ok" | 0x81: "lowBattery" | 0x83: "expired" >, // Transmitter Status
    sequence: <int>, // increments for each glucose value read
    timestamp: <int>, // in seconds since transmitter start
    glucoseIsDisplayOnly: <bool>,
    glucose: <int>, // in mg/dl
    state: <int>, // Sensor Session Status: see transmitterIO.js:stateString() for full list of values
    trend: <int>
  },
  timeMessage: {
    status: <0: "ok" | 0x81: "lowBattery" | 0x83: "expired" >, // Transmitter Status
    currentTime: <int>, // in seconds since transmitter start
    sessionStartTime: <int> // sensor session start time given in seconds since transmitter start
  },
  status: <0: "ok" | 0x81: "lowBattery" | 0x83: "expired" >, // Transmitter Status
  state: <int>, // Sensor Session Status: see transmitterIO.js:stateString() for full list of values
  transmitterStartDate: <string>, // time of transmitter start such as "2018-05-10T23:58:45.294Z"
  sessionStartDate: <string>, // time of session start such as "2018-08-23T16:09:34.294Z"
  readDate: <string>, // time of glucose value read such as "2018-08-26T18:58:19.294Z"
  isDisplayOnly: <bool>,
  filtered: <int>, // mg/dL * 1000
  unfiltered: <int>, // mg/dL * 1000
  glucose: <int>, // mg/dl
  trend: <int>, // mg/dL per ten minutes
  canBeCalibrated: <bool>
  rssi: <int>, // receive signal strength indicator
};

transmitter.on('glucose', callback(glucose));
```

#### Get Messages

Respond to getMessages with array of messages to send to transmitter

```javascript
transmitter.on('getMessages', callback());
```

#### Message processed

```javascript
details = {
  time: <int> // epoch time
};

transmitter.on('messageProcessed', callback(details));
```

#### Battery Status
```javascript
details = {
  voltagea: <int>, // V * 200 - voltage level of battery a
  voltageb: <int>, // V * 200 - voltage level of battery b
  resist: <int>, // measured resistance - units unknown
  runtime: <int>, // number of days since transmitter started
  temperature: <int>, // Centigrade temperature of transmitter
};

transmitter.on('batteryStatus', callback(details));
```

#### Calibration data
```javascript
calibrationData = {
  date: <string>, // time of calibration glucose value such as "2018-08-26T18:58:19.294Z"
  glucose: <int> // User entered calibration glucose in mg/dL
};

transmitter.on('calibrationData', callback(calibrationData));
```

#### Transmitter disconnected

```javascript
transmitter.on('disconnect', callback);
```

### Supported Messages

These messages can be send in an array in response to a `getMessages` event

#### Sensor Start

```javascript
startMsg = {
  type: 'StartSensor',
  date: <int>, // epoch time to start sensor session
  sensorSerialCode: <int> // sensor serial number
};
```

#### Sensor Stop

```javascript
stopMsg = {
  type: 'StopSensor',
  date: <int> // epoch time to stop sensor session
};
```

#### Calibrate Sensor

```javascript
calibrateMsg = {
  type: 'CalibrateSensor',
  date: <int>, // epoch time of glucose reading
  glucose: <int> // glucose value in mg/dL
};
```

#### Reset Transmitter

```javascript
resetMsg = {
  type: 'ResetTx'
};
```

#### Request Battery Status

```javascript
batteryStatusRequestMsg = {
  type: 'BatteryStatus'
};
```

