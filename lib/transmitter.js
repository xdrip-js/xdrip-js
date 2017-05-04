const crypto = require('crypto');
const events = require('events');
const util = require('util');
const debug = require('debug')('transmitter');

const BluetoothManager = require('./bluetooth-manager');

// messages
const AuthRequestTxMessage = require('./messages/auth-request-tx-message');         // 0x01
const AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message');     // 0x03
const AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message');     // 0x04
const AuthStatusRxMessage = require('./messages/auth-status-rx-message');           // 0x05
const KeepAliveTxMessage = require('./messages/keep-alive-tx-message');             // 0x06
const BondRequestTxMessage = require('./messages/bond-request-tx-message');         // 0x07

const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message'); // 0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message'); // 0x25
const SessionStartTxMessage = require('./messages/session-start-tx-message');       // 0x26
//const SessionStartRxMessage = require('./messages/session-start-rx-message'); // not yet defined
// const CalibrationRxMessage = require('./messages/calibration-rx-message'); // not yet defined
const GlucoseTxMessage = require('./messages/glucose-tx-message');                  // 0x30
const GlucoseRxMessage = require('./messages/glucose-rx-message');                  // 0x31
const CalibrationTxMessage = require('./messages/calibration-tx-message');          // 0x34
const VersionRequestTxMessage = require('./messages/version-request-tx-message');   // 0x4a

const Glucose = require('./glucose');
//const BatteryStatusTxMessage = require('./messages/battery-status-tx-message');

const UUID = require('./bluetooth-services');

let manager;
let cryptKey;

function Transmitter(id) {
  this.id = id;
  cryptKey = '00' + id + '00' + id;
  manager = new BluetoothManager(this);
}

util.inherits(Transmitter, events.EventEmitter);

Transmitter.prototype.shouldConnect = function(peripheral) {
  const name = peripheral.advertisement.localName;
  return lastTwoCharactersOfString(name) == lastTwoCharactersOfString(this.id);
};

Transmitter.prototype.isReady = function() {
  debug("bluetooth is ready");
  authenticateOld.call(this)
  .then(control.bind(this));
  // TODO: send disconnect message here
};

// should this be Transmitter.prototype.authenticate ... ???
// maybe not? private?
function authenticateOld() {
  // TODO: consider what to do if the device is already authenticated?
  // e.g. try to read from Auth characteristic, if 050101 skip the rest?
  // or maybe some other tests instead?
  debug('in authenticate');
  const uuid = UUID.CGMServiceCharacteristic.Authentication;
  debug('in authenticate, about to call readValueAndWait');
  // return manager.readValueAndWait(uuid)
  // .then(data => new AuthStatusRxMessage(data))
  // .catch(reason => debug(Profiling.now().toFixed(3) + ': ' + reason))
  // .then(() => manager.setNotifyEnabledAndWait(true, uuid))
  // .catch(reason => debug(Profiling.now().toFixed(3) + ': ' + reason))
//
 // return manager.setNotifyEnabledAndWait(true, uuid)
  // .then(() => {
  //   const message = new BatteryStatusTxMessage();
  //   return manager.writeValueAndWait(message.data, uuid);
  // })
  // .then((data) => debug('Battery status :' + data.toString('hex')))
  // .then(() => {
  const message = new AuthRequestTxMessage();
  debug('auth request: ' + message.data.toString('hex'));
  debug('1. send auth-request-tx-message and listen for write event');
  return manager.writeValueAndWait(message.data, uuid)
  .then(() => {
    debug('2. on write, read characteristic and wait for read event');
    return manager.readValueAndWait(uuid);
  })
  .then(data => {
    debug('3. on read, expect an auth-challenge-rx-message, create new message from data');
    debug('read ' + data.toString('hex'));
    const response = new AuthChallengeRxMessage(data);
    // debug('***    tokenHash:    ***');
    // debug(response.tokenHash);
    // debug('***    my hash:      ***')
    // debug(calculateHash(message.singleUseToken));
    debug('4. hash the challenge, create new auth-challenge-tx-message and write this to auth characteristic');
    const passedChallenge = response.tokenHash.equals(calculateHash(message.singleUseToken));
    if (!passedChallenge) {
      throw Error("Transmitter failed auth challenge");
    }
    return response;
  })
  .then(response => {
    const challengeHash = calculateHash(response.challenge);
    debug('challengeHash: ' + challengeHash.toString('hex'));
    const message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(() => {
    debug('5. on write, read characteristic and wait for read event');
    // we get stuck here a bit: should we retry a few times after reasonable timeout
    return manager.readValueAndWait(uuid);
  })
  .then(data => {
    debug('6. on read, expect auth-status-rx-message, check authenticated and bonded');
    debug('read ' + data.toString('hex'));
    // really, need some logic here to deal with different responses...
    // (are we authenticated? are we bonded?)
    // const message = new AuthStatusRxMessage(data);
    // if (message.authenticated) ...
    // if (message.bonded) ...
    debug('7. (depending on result of 6) create new keep-alive-tx-message with 25 s and write');
    const message = new KeepAliveTxMessage(25);
    return manager.writeValueAndWait(message.data, uuid);
  })
  // .then(() => manager.readValueAndWait(uuid))
  .then(() => {
    debug('8. on write, expect keep-alive opcode, perform bond write');
    // expect keepalive opcode (0x6)
    const message = new BondRequestTxMessage();
    // 0x01 here just as placeholder
    return manager.writeValueAndWait(message.data, uuid, '0x01', 15000);
  });
  // TODO: the program doesn't wait here for the pairing request to be accepted
  // before moving on to the control step - need to fix.
  // .then(() => manager.readValueAndWait(uuid))
  // .then(data => {
  //   debug('6. on read, expect auth-status-rx-message, check authenticated and bonded');
  //   debug('read ' + data.toString('hex') + ' after ' + Profiling.now() + ' seconds.');
  // });
}

function authenticate() {
  // TODO: consider what to do if the device is already authenticated?
  // e.g. try to read from Auth characteristic, if 050101 skip the rest?
  // or maybe some other tests instead?
  debug('in authenticate');
  const uuid = UUID.CGMServiceCharacteristic.Authentication;
  debug('in authenticate, about to call readValueAndWait');
//  return manager.readValueAndWait(uuid)
//  .then(data => new AuthStatusRxMessage(data))
  // .catch(reason => debug(Profiling.now().toFixed(3) + ': ' + reason))
  // .then(() => manager.setNotifyEnabledAndWait(true, uuid))
  // .catch(reason => debug(Profiling.now().toFixed(3) + ': ' + reason))
//
  return manager.setNotifyEnabledAndWait(true, uuid)
  // .then(() => {
  //   const message = new BatteryStatusTxMessage();
  //   return manager.writeValueAndWait(message.data, uuid);
  // })
  // .then((data) => debug('Battery status :' + data.toString('hex')))
  .then(() => {
    const message = new AuthRequestTxMessage();
    debug('auth request: ' + message.data.toString('hex'));
    debug('1. send auth-request-tx-message and listen for write event');
    return manager.writeValueAndWaitForNotification(message.data, uuid)
    .then(data => {
      debug('3. on read, expect an auth-challenge-rx-message, create new message from data');
      debug('read ' + data.toString('hex'));
      const response = new AuthChallengeRxMessage(data);
      // debug('***    tokenHash:    ***');
      // debug(response.tokenHash);
      // debug('***    my hash:      ***')
      // debug(calculateHash(message.singleUseToken));
      debug('4. hash the challenge, create new auth-challenge-tx-message and write this to auth characteristic');
      const passedChallenge = response.tokenHash.equals(calculateHash(message.singleUseToken));
      if (!passedChallenge) {
        throw Error("Transmitter failed auth challenge");
      }
      return response;
    });
  })
  .then(response => {
    const challengeHash = calculateHash(response.challenge);
    debug('challengeHash: ' + challengeHash.toString('hex'));
    const message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWaitForNotification(message.data, uuid);
  })
  .then(data => {
    debug('6. on read, expect auth-status-rx-message, check authenticated and bonded');
    debug('read ' + data.toString('hex'));
    // really, need some logic here to deal with different responses...
    // (are we authenticated? are we bonded?)
    // const message = new AuthStatusRxMessage(data);
    // if (message.authenticated) ...
    // if (message.bonded) ...
    debug('7. (depending on result of 6) create new keep-alive-tx-message with 25 s and write');
    const message = new KeepAliveTxMessage(25);
    return manager.writeValueAndWait(message.data, uuid);
  })
  // .then(() => manager.readValueAndWait(uuid))
  .then(() => {
    debug('8. on write, expect keep-alive opcode, perform bond write');
    // expect keepalive opcode (0x6)
    const message = new BondRequestTxMessage();
    // 0x01 here just as placeholder
    return manager.writeValueAndWaitForNotification(message.data, uuid, 0x08, 15000);
  })
  .then(() => manager.setNotifyEnabledAndWait(false, uuid))
  .then(() => {
    manager.readValueAndWait(uuid);
  })
  .then((message) => {
    debug("auth: " + message.toString('hex'));
  });
  // TODO: the program doesn't wait here for the pairing request to be accepted
  // before moving on to the control step - need to fix.
  // .then(data => {
  //   debug('6. on read, expect auth-status-rx-message, check authenticated and bonded');
  //   debug('read ' + data.toString('hex') + ' after ' + Profiling.now() + ' seconds.');
  // });
}


function control() {
  debug('***   starting control     ***');
  const uuid = UUID.CGMServiceCharacteristic.Control;

  // let syncDate;
  // let timeMessage;

  return manager.setNotifyEnabledAndWait(true, uuid)
  // ////////////// VERSION REQUEST, NO NEED TO DO THIS EACH TMIE /////////
  // .then(() => {
  //   const message = new VersionRequestTxMessage();
  //   return manager.writeValueAndWaitForNotification(message.data, uuid)
  //   .then(data => debug('version: ' + data.toString('hex')));
  // })
  // .then(() => {
  //   const message = new TransmitterTimeTxMessage();
  //   return manager.writeValueAndWaitForNotification(message.data, uuid);
  // })
  .then(() => {
    // const syncDate = Date.now();
    // const timeMessage = new TransmitterTimeRxMessage(data);
    // debug('message: ' + timeMessage.toString('hex'));

////////////// CALIBRATION /////////
    // debug('creating calibration tx message');
    // const calibrationMessage = new CalibrationTxMessage(135, timeMessage.currentTime);
    // return manager.writeValueAndWaitForNotification(calibrationMessage.data, uuid)
    // .then(data => {
    //   debug('calibrationRxMessage: ' + data.toString('hex'));

///////////// SESSION START //////////
    // debug('creating session start tx message');
    // const sessionStartMessage = new SessionStartTxMessage(timeMessage.currentTime - 60);
    // return manager.writeValueAndWaitForNotification(sessionStartMessage.data, uuid)
    // .then(data => {
    //   debug('sessionStartRxMessage: ' + data.toString('hex'));
      debug('creating glucose tx message');
      const message = new GlucoseTxMessage();
      return manager.writeValueAndWaitForNotification(message.data, uuid)//;
  //  })
    // .then(data => {
    //   const glucoseMessage = new GlucoseRxMessage(data);
    //   const glucose = new Glucose(glucoseMessage, timeMessage, syncDate);
    //   this.emit('glucose', glucose);
//    });
//    return timeMessage;
  })
  .then(message => debug('message: ' + message))
//  .then(data => debug(data.toString('hex')))
//  .then(() => {
//    debug('creating glucose tx message');
//    const message = new GlucoseTxMessage();
//    return manager.writeValueAndWaitForNotification(message.data, uuid);
//  })
//  .then(() => manager.waitForNotification(uuid))
  // .then((data) => {
  //   const message = new GlucoseRxMessage(data);
  //   const glucose = new Glucose(message, timeMessage, syncDate);
  //   this.emit('glucose', data.toString('hex')))
  // }
  .then(() => manager.setNotifyEnabledAndWait(false, uuid))
  .catch(reason => debug(reason));
}


//        guard let timeMessage = TransmitterTimeRxMessage(data: timeData) else {
//            throw TransmitterError.controlError("Unable to parse time response: \(timeData.hexadecimalString)")
//        }

//        let activationDate = Date(timeIntervalSinceNow: -TimeInterval(timeMessage.currentTime))


function calculateHash(data) {
  if (data.length != 8) {
    throw Error('cannot hash');
  }

  const doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  const encrypted = encrypt(doubleData);
  return Buffer.allocUnsafe(8).fill(encrypted);
}

function encrypt(buffer){
  const algorithm = 'aes-128-ecb';
  const cipher = crypto.createCipheriv(algorithm, cryptKey, '');
  const encrypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  return encrypted;
}

function lastTwoCharactersOfString(string) {
  return string.substr(string.length - 2);
}

module.exports = Transmitter;
