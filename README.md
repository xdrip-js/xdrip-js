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

### Create New Instance
```javascript
const Transmitter = require('xdrip-js');

// transmitterId is 6-character transmitter serial number
// getMessagesCallback is callback function to return array of messages to send to transmitter
const transmitter = new Transmitter(transmitterId, getMessagesCallback); 
```

### Events

See [Node.js EventEmitter docs](https://nodejs.org/api/events.html) for more info on the event API.

#### Glucose read event

```javascript
glucose = {
  inSession: <bool>,
  glucoseMessage: {
    status: <0: "ok" | 0x81: "lowBattery" | 0x83: "expired" >, // Transmitter Status
    sequence: <int>,                                           // increments for each glucose value read
    timestamp: <int>,                                          // in seconds since transmitter start
    glucoseIsDisplayOnly: <bool>,
    glucose: <int>,               // in mg/dL
    state: <int>,                 // Session Status: see below for full list of valid values
    trend: <int>                  // Glucose trend in mg/dL per 10 minutes
  },
  timeMessage: {
    status: <0: "ok" | 0x81: "lowBattery" | 0x83: "expired" >, // Transmitter Status
    currentTime: <int>,                                        // in seconds since transmitter start
    sessionStartTime: <int>                                    // session start in seconds since transmitter start
  },
  status: <0: "ok" | 0x81: "lowBattery" | 0x83: "expired" >, // Transmitter Status
  state: <int>,                   // Session Status: see below for full list of valid values
  transmitterStartDate: <string>, // time of transmitter start such as "2018-05-10T23:58:45.294Z"
  sessionStartDate: <string>,     // time of session start such as "2018-08-23T16:09:34.294Z"
  readDate: <string>,             // time of glucose value read such as "2018-08-26T18:58:19.294Z"
  isDisplayOnly: <bool>,
  filtered: <int>,                // mg/dL * 1000
  unfiltered: <int>,              // mg/dL * 1000
  glucose: <int>,                 // mg/dL
  trend: <int>,                   // Glucose trend in mg/dL per 10 minutes
  canBeCalibrated: <bool>         // transmitter able to accept calibration command?
  rssi: <int>,                    // receive signal strength indicator
};

transmitter.on('glucose', callback(glucose));
```

##### Session Status Valid Values
```javascript
validSessionValues = [
  0x00, // None
  0x01, // Stopped
  0x02, // Warmup
  0x03, // Unused
  0x04, // First Calibration
  0x05, // Second Calibration
  0x06, // OK
  0x07, // Need calibration
  0x08, // Calibration Error 1
  0x09, // Calibration Error 0
  0x0a, // Calibration Linearity Fit Failure
  0x0b, // Sensor Failed Due to Counts Aberration
  0x0c, // Sensor Failed Due to Residual Aberration
  0x0d, // Out of Calibration Due To Outlier
  0x0e, // Outlier Calibration Request - Need a Calibration
  0x0f, // Session Expired
  0x10, // Session Failed Due To Unrecoverable Error
  0x11, // Session Failed Due To Transmitter Error
  0x12, // Temporary Session Failure - ???
  0x13, // Reserved
  0x80, // Calibration State - Start
  0x81, // Calibration State - Start Up
  0x82, // Calibration State - First of Two Calibrations Needed
  0x83, // Calibration State - High Wedge Display With First BG
  0x84, // Unused Calibration State - Low Wedge Display With First BG
  0x85, // Calibration State - Second of Two Calibrations Needed
  0x86, // Calibration State - In Calibration Transmitter
  0x87, // Calibration State - In Calibration Display
  0x88, // Calibration State - High Wedge Transmitter
  0x89, // Calibration State - Low Wedge Transmitter
  0x8a, // Calibration State - Linearity Fit Transmitter
  0x8b, // Calibration State - Out of Cal Due to Outlier Transmitter
  0x8c, // Calibration State - High Wedge Display
  0x8d, // Calibration State - Low Wedge Display
  0x8e, // Calibration State - Linearity Fit Display
  0x8f, // Calibration State - Session Not in Progress
];
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
  voltagea: <int>,    // V * 200 - voltage level of battery a
  voltageb: <int>,    // V * 200 - voltage level of battery b
  resist: <int>,      // measured resistance - units unknown
  runtime: <int>,     // number of days since transmitter started
  temperature: <int>, // Centigrade temperature of transmitter
};

transmitter.on('batteryStatus', callback(details));
```

#### Calibration data
```javascript
calibrationData = {
  date: <string>, // time of last calibration such as "2018-08-26T18:58:19.294Z"
  glucose: <int>  // User entered calibration glucose in mg/dL
};

transmitter.on('calibrationData', callback(calibrationData));
```

#### Transmitter disconnected

```javascript
transmitter.on('disconnect', callback());
```

### Supported Messages

These messages can be sent to the transmitter by returning an array of them from the getMessagesCallback function

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

