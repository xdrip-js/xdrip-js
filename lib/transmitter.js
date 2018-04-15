/*jshint loopfunc: true */

const crypto = require('crypto');
const events = require('events');
const util = require('util');
const debug = require('debug')('transmitter');

const BluetoothManager = require('./bluetooth-manager');

// auth messages
const AuthRequestTxMessage = require('./messages/auth-request-tx-message');           // 0x01, 0x02
const AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message');       // 0x03
const AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message');       // 0x04
const AuthStatusRxMessage = require('./messages/auth-status-rx-message');             // 0x05
const KeepAliveTxMessage = require('./messages/keep-alive-tx-message');               // 0x06
const BondRequestTxMessage = require('./messages/bond-request-tx-message');           // 0x07
const BondRequestRxMessage = require('./messages/bond-request-rx-message');           // 0x08

// control messages
const DisconnectTxMessage = require('./messages/disconnect-tx-message');              // 0x09
// TODO: create BatteryStatusTxMessage                                                // 0x22
// TODO: create BatteryStatusRxMessage                                                // 0x23
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message');   // 0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message');   // 0x25
const SessionStartTxMessage = require('./messages/session-start-tx-message');         // 0x26
const SessionStartRxMessage = require('./messages/session-start-rx-message');         // 0x27
const SessionStopTxMessage = require('./messages/session-stop-tx-message');           // 0x28
const SessionStopRxMessage = require('./messages/session-stop-rx-message');           // 0x29
const SensorTxMessage = require('./messages/sensor-tx-message');                      // 0x2e
const SensorRxMessage = require('./messages/sensor-rx-message');                      // 0x2f
const GlucoseTxMessage = require('./messages/glucose-tx-message');                    // 0x30
const GlucoseRxMessage = require('./messages/glucose-rx-message');                    // 0x31
const CalibrationDataTxMessage = require('./messages/calibration-data-tx-message');   // 0x32
const CalibrationDataRxMessage = require('./messages/calibration-data-rx-message');   // 0x33
const CalibrateGlucoseTxMessage = require('./messages/calibrate-glucose-tx-message'); // 0x34
const CalibrateGlucoseRxMessage = require('./messages/calibrate-glucose-rx-message'); // 0x35
const ResetTxMessage = require('./messages/transmitter-reset-tx-message');            // 0x42
const ResetRxMessage = require('./messages/transmitter-reset-rx-message');            // 0x43
const VersionRequestTxMessage = require('./messages/version-request-tx-message');     // 0x4a
const VersionRequestRxMessage = require('./messages/version-request-rx-message');     // 0x4b
const BackfillTxMessage = require('./messages/backfill-tx-message');                  // 0x50
const BackfillRxMessage = require('./messages/backfill-rx-message');                  // 0x51

const Glucose = require('./glucose');
const UUID = require('./bluetooth-services');

let manager;
let _getMessages;

function Transmitter(id, getMessages) {
  this.id = id;
  _getMessages = getMessages || (() => []);
  manager = new BluetoothManager(this);
}

util.inherits(Transmitter, events.EventEmitter);

Transmitter.prototype.shouldConnect = function(peripheral) {
  const name = peripheral.advertisement.localName;
  if (!name) return false;
  return lastTwoCharactersOfString(name) == lastTwoCharactersOfString(this.id);
};

Transmitter.prototype.isReady = function() {
  // TODO: control proceeds whether or not auth was successful. Fix.
  authenticate.call(this)
  .then(_getMessages)
  .then(control.bind(this))
  .catch(debug);
};

Transmitter.prototype.didDisconnect = function() {
  this.emit('disconnect');
};

// Transmitter.prototype.startSensor = function() {
//   startPending = true;
// };
//
// Transmitter.prototype.getVersion = function() {
//   return new Promise(resolve => {
//     resolveVersion = resolve;
//   });
// };
//
// Transmitter.prototype.calibrate = function(glucose) {
//   calibrationPending = {
//     date: Date.now(),
//     glucose: glucose
//   }
//
//   // const date = Date.now();
//   // return new Promise((resolve, reject) => {
//   //   calibrations.push({date, glucose, resolve, reject});
//   // });
//
//   // calibrationPending = {
//   //   time: Date.now(),
//   //   glucose
//   // };
//   // return calibrationPending;
// };

function authenticate() {
  const uuid = UUID.CGMServiceCharacteristic.Authentication;

  const message = new AuthRequestTxMessage();
  return manager.writeValueAndWait(message.data, uuid)
  .then(() => manager.readValueAndWait(uuid, AuthChallengeRxMessage.opcode))
  .catch(reason => {throw 'Error writing transmitter challenge: ' + reason;})
  .then(data => {
    const response = new AuthChallengeRxMessage(data);
    if (response.tokenHash.equals(calculateHash(message.singleUseToken, this.id))) {
      return response;
    } else {
      throw 'transmitter failed auth challenge';
    }
  })
  // consider nesting these next two then() statements (i.e. write then read)
  .then(response => {
    const challengeHash = calculateHash(response.challenge, this.id);
    const message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(() =>
    manager.readValueAndWait(uuid, AuthStatusRxMessage.opcode)
    .catch(reason => {throw 'Error: ' + reason;})
  )
  .then(data => {
    const status = new AuthStatusRxMessage(data);
    debug('transmitter responded with status message ' + data.toString('hex'));
    if (status.authenticated !== 1) {
      throw 'transmitter rejected auth challenge';
    }
    const message = new KeepAliveTxMessage(25);
    return manager.writeValueAndWait(message.data, uuid)
    .then(() => {
      if (status.bonded === 1) {
        debug('transmitter already bonded');
        return;
      }
      const message = new BondRequestTxMessage();
      return manager.writeValueAndWait(message.data, uuid);
    });
  });
}

Transmitter.prototype.reset = function() {
    this.isReady();
    const uuid = UUID.CGMServiceCharacteristic.Control;
    const resetTxMessage = new ResetTxMessage();
    return manager.writeValueAndWaitForNotification(resetTxMessage.data, uuid)
          .then(data => new ResetRxMessage(data));
}

function control(messages) {
  const uuid = UUID.CGMServiceCharacteristic.Control;

  return manager.setNotifyEnabledAndWait(true, uuid)

  // the new way
  // if (resolveVersion) {
  //   const message = new VersionRequestTxMessage();
  //   return manager.writeValueAndWaitForNotification(message.data, uuid)
  //   .then(data => new VersionRequestRxMessage(data))
  //   .then(message => {
  //     resolveVersion(message.version);
  //   });
  // }



  // update tranmitter version, if necessary
  .then(processVersion.bind(this)).then(debug)
  // send tranmitter time tx message
  .then(() => {
    const message = new TransmitterTimeTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid);
  })
  .then(data => {
    const syncDate = Date.now();
    const timeMessage = new TransmitterTimeRxMessage(data);

    return processMessages.call(this, messages, uuid, syncDate, timeMessage)
    // send glucose tx message
    .then(() => {
      const message = new GlucoseTxMessage();
      return manager.writeValueAndWaitForNotification(message.data, uuid);
    })
    // on receipt of glucose rx message create new glucose and notify observers
    .then(data => {
      const glucoseMessage = new GlucoseRxMessage(data);
      const message = new SensorTxMessage();
      return manager.writeValueAndWaitForNotification(message.data, uuid)
      .then((data) => {
        const message = new SensorRxMessage(data);
        const glucose = new Glucose(glucoseMessage, timeMessage, syncDate, sensorMessage = message);
        this.emit('glucose', glucose);
      });
    })
    .then(() => {
      const message = new CalibrationDataTxMessage();
      return manager.writeValueAndWaitForNotification(message.data, uuid);
    })
    .then(data => {
      const message = new CalibrationDataRxMessage(data);
      const calibrationData = {
        date: syncDate - (timeMessage.currentTime - message.timestamp) * 1000,
        glucose: message.glucose
      };
      this.emit('calibrationData', calibrationData);
    });
  })
  .then(() => manager.setNotifyEnabledAndWait(false, uuid))
  .then(processBackfill.bind(this)).then(debug)
  .then(() => {
    const message = new DisconnectTxMessage();
    return manager.writeValueAndWait(message.data, uuid);
  })
  // TODO: after sending a glucose request 0x30, we should send a calibration data request (0x32)
  // TODO: have a think about what to do when an error occurs:
  // we want to catch it, and set notify to false regardless of the result
  // but prob return the rejected promise???
  .catch(debug);
}

function processVersion() {
  if (true) { // TODO: test for currency of version information
    return Promise.resolve("Version info up to date, returning.");
  } else {
    const message = new VersionRequestTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid)
    .then(data => debug('version: ' + data.toString('hex')));
  }
}

// messages are of the form
// {
//   date,
//   type,
//   [glucose]
// }
function processMessages(messages, uuid, syncDate, timeMessage) {
  let promise = Promise.resolve();
  while (messages.length) {
    const message = messages.shift();
    const messageTimeInDexSeconds = timeMessage.currentTime - Math.floor((syncDate - message.date)/1000);
    promise = promise.then(() => {
      switch (message.type) {
        case "StartSensor":
          const sessionStartMessage = new SessionStartTxMessage(messageTimeInDexSeconds);
          return manager.writeValueAndWaitForNotification(sessionStartMessage.data, uuid)
          .then(data => new SessionStartRxMessage(data));
        case "CalibrateSensor":
          const calibrationMessage = new CalibrateGlucoseTxMessage(
            message.glucose,
            messageTimeInDexSeconds
          );
          return manager.writeValueAndWaitForNotification(calibrationMessage.data, uuid)
          .then(data => new CalibrateGlucoseRxMessage(data));
        case "StopSensor":
          const sessionStopMessage = new SessionStopTxMessage(messageTimeInDexSeconds);
          return manager.writeValueAndWaitForNotification(sessionStopMessage.data, uuid)
          .then(data => new SessionStopRxMessage(data));
      }
    })
    .then(rxMessage => {
      this.emit('messageProcessed', {time: message.date});
      console.log("got message " + rxMessage);
    });
  }
  return promise;
}

function processBackfill() {
  if (true) { // TODO: test whether we need to ask for backfill
    return Promise.resolve("No need to backfill, returning.");
  } else {
    parser = new BackfillParser(/* callback */);
    const backfillMessage = new BackfillTxMessage();
    return manager.writeValueAndWaitForNotification(backfillMessage.data, uuid, BackfillRxMessage.opcode)
    .then(data => new BackfillRxMessage(data));
  }
}

function calculateHash(data, id) {
  if (data.length != 8) {
    throw Error('cannot hash');
  }

  const doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  const encrypted = encrypt(doubleData, id);
  return Buffer.allocUnsafe(8).fill(encrypted);
}

function cryptKey(id) {
  return '00' + id + '00' + id;
}

function encrypt(buffer, id) {
  const algorithm = 'aes-128-ecb';
  const cipher = crypto.createCipheriv(algorithm, cryptKey(id), '');
  const encrypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  return encrypted;
}

function lastTwoCharactersOfString(string) {
  return string.substr(string.length - 2);
}

module.exports = Transmitter;
