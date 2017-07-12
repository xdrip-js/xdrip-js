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
const DisconnectTxMessage = require('./messages/disconnect-tx-message');              // 0x09

// control messages
// TODO: create BatteryStatusTxMessage                                                // 0x22
// TODO: create BatteryStatusRxMessage                                                // 0x23
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message');   // 0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message');   // 0x25
const SessionStartTxMessage = require('./messages/session-start-tx-message');         // 0x26
const SessionStartRxMessage = require('./messages/session-start-rx-message');         // 0x27
// TODO: create SessionStopTxMessage                                                  // 0x28
// TODO: create SessionStopRxMessage                                                  // 0x29
// TODO: create SensorTxMessage                                                       // 0x2e
// (see https://github.com/NightscoutFoundation/xDrip/blob/master/app/src/main/java/com/eveningoutpost/dexdrip/G5Model/SensorTxMessage.java)
// TODO: create SensorRxMessage                                                       // 0x2f
// (see https://github.com/NightscoutFoundation/xDrip/blob/master/app/src/main/java/com/eveningoutpost/dexdrip/G5Model/SensorRxMessage.java)
const GlucoseTxMessage = require('./messages/glucose-tx-message');                    // 0x30
const GlucoseRxMessage = require('./messages/glucose-rx-message');                    // 0x31
const CalibrationDataTxMessage = require('./messages/calibration-data-tx-message');   // 0x32
const CalibrationDataRxMessage = require('./messages/calibration-data-rx-message');   // 0x33
const CalibrateGlucoseTxMessage = require('./messages/calibrate-glucose-tx-message'); // 0x34
const CalibrateGlucoseRxMessage = require('./messages/calibrate-glucose-rx-message'); // 0x35
const VersionRequestTxMessage = require('./messages/version-request-tx-message');     // 0x4a
const VersionRequestRxMessage = require('./messages/version-request-rx-message');     // 0x4b
const BackfillTxMessage = require('./messages/backfill-tx-message');                  // 0x50
const BackfillRxMessage = require('./messages/backfill-rx-message');                  // 0x51

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
  // TODO: control proceeds whether or not auth was successful. Fix.
  debug("bluetooth is ready");

  const uuid = UUID.CGMServiceCharacteristic.Authentication;

    // return manager.readValueAndWait(uuid)
    // .then(data => {
    //   debug('read value ' + data.toString('hex'));
    // });

    authenticateAlternate.call(this);
  // .then(control.bind(this))
  // .catch(reason => debug(reason))
  // .then(() => {
  //   const message = new DisconnectTxMessage();
  //   return manager.writeValueAndWait(message.data, UUID.CGMServiceCharacteristic.Control);
  // });
};

// THINK WE CAN GET RID OF THIS!!!
// function authenticate() {
//   const uuid = UUID.CGMServiceCharacteristic.Authentication;
//
//   return manager.readValueAndWait(uuid)
//   .then(data => {
//     try {
//       const status = new AuthStatusRxMessage(data);
//       if ((status.authenticated === 1) && (status.bonded === 1)) {
//         debug('peripheral already authenticated and bonded');
//         const message = new KeepAliveTxMessage(25);
//         return manager.writeValueAndWait(message.data, uuid);
//       }
//     } catch (err) {debug('data: ' + data.toString('hex'));}
//     debug('peripheral not fully authenticated: ' + data.toString('hex') + ', proceeding to full auth');
//     return fullAuthenticate(uuid);
//   });
// }

// TODO: add expected opcodes
function authenticate() {
  const uuid = UUID.CGMServiceCharacteristic.Authentication;

  const message = new AuthRequestTxMessage();
  return manager.writeValueAndWait(message.data, uuid)
  .then(() => manager.readValueAndWait(uuid))
  .catch(reason => {throw 'Error writing transmitter challenge: ' + reason;})
  .then(data => {
    const response = new AuthChallengeRxMessage(data);
    if (response.tokenHash.equals(calculateHash(message.singleUseToken))) {
      return response;
    } else {
      throw 'transmitter failed auth challenge';
    }
  })
  .then(response => {
    const challengeHash = calculateHash(response.challenge);
    const message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(() =>
    manager.readValueAndWait(uuid)
    .catch(reason => {throw 'onse: ' + reason;})
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
      return manager.setNotifyEnabledAndWait(true, uuid)
      .catch(reason => {throw 'Error enabling notification: ' + reason;})
      .then(() => {
        const message = new BondRequestTxMessage();
        return manager.writeValueAndWait(message.data, uuid);
      })
      // TRY TO USE READ AND WAIT RATHER THAN WAIT FOR NOTIFICATION
      // .then(() =>
      //   manager.waitForNotification(uuid, AuthStatusRxMessage.opcode, 15000)
      //   .catch(reason => {throw 'transmitter failed to bond: ' + reason;})
      // )
      // .then(() =>
      //   manager.readValueAndWait(uuid, BondRequestTxMessage.opcode, 15000)
      //   .catch(reason => {throw 'transmitter failed to bond: ' + reason;})
      // )
      .then(() => {
        setTimeout(() => {return;}, 20000);
      });
      // .then(() =>
      //   manager.readValueAndWait(uuid, AuthStatusRxMessage.opcode, 15000)
      //   .catch(reason => {throw 'transmitter failed to bond: ' + reason;})
      // )
      // .then(data => {
      //   const status = new AuthStatusRxMessage(data);
      //   if (status.bonded !== 1) {
      //     throw 'transmitter failed to bond';
      //   }
      // });
    });
  });
}

function authenticateAlternate() {
  const uuid = UUID.CGMServiceCharacteristic.Authentication;

  return manager.setNotifyEnabledAndWait(true, uuid)
  .catch(reason => {throw 'Error enabling notification: ' + reason;})
  .then(() => {
    const message = new AuthRequestTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid)
    .catch(reason => {throw 'Error writing transmitter challenge: ' + reason;})
    .then(data => {
      const response = new AuthChallengeRxMessage(data);
      if (response.tokenHash.equals(calculateHash(message.singleUseToken))) {
        return response;
      } else {
        throw 'transmitter failed auth challenge';
      }
    });
  })
  .then(response => {
    const challengeHash = calculateHash(response.challenge);
    const message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWaitForNotification(message.data, uuid)
    .catch(reason => {throw 'Error writing challenge response: ' + reason;});
  })
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


      return manager.writeValueAndWaitForNotification(message.data, uuid, 0xff)
      .then(data => manager.waitForNotification(uuid, BondRequestRxMessage.opcode, 15000))

      // TRYING A LONG WAIT
      .then(() => {
        setTimeout(() => {return;}, 20000);
      });
      // END TRYING A LONG WAIT



      //   return manager.readValueAndWait(uuid)
      //   .then(data => {

    //   .then(() =>
    //     manager.waitForNotification(uuid, AuthStatusRxMessage.opcode, 15000)
    //     .catch(reason => {throw 'transmitter failed to bond: ' + reason;})
    //   );
    //   // .then(data => {
    //   //   const status = new AuthStatusRxMessage(data);
    //   //   if (status.bonded !== 1) {
    //   //     throw 'transmitter failed to bond';
    //   //   }
      // });
    });
  });
  // .catch(reason => debug(reason))
  // .then(() => {
  //   return manager.setNotifyEnabledAndWait(false, uuid);
  // });
}


function control() {
  const uuid = UUID.CGMServiceCharacteristic.Control;

  return manager.setNotifyEnabledAndWait(true, uuid)
  // ////////////// VERSION REQUEST, NO NEED TO DO THIS EACH TMIE /////////
  // .then(() => {
  //   const message = new VersionRequestTxMessage();
  //   return manager.writeValueAndWaitForNotification(message.data, uuid)
  //   .then(data => debug('version: ' + data.toString('hex')));
  // })
  .then(() => {
    const message = new TransmitterTimeTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid);
  })
  .then(data => {
    const syncDate = Date.now();
    const timeMessage = new TransmitterTimeRxMessage(data);
///////////// SESSION START //////////
    // debug('creating session start tx message');
    // const sessionStartMessage = new SessionStartTxMessage(timeMessage.currentTime - 60);
    // return manager.writeValueAndWaitForNotification(sessionStartMessage.data, uuid)
    // .then(data => {
    //   debug('sessionStartRxMessage: ' + data.toString('hex'));

////////////// CALIBRATION /////////
    // debug('creating calibration tx message');
    // const calibrationMessage = new CalibrationTxMessage(135, timeMessage.currentTime);
    // return manager.writeValueAndWaitForNotification(calibrationMessage.data, uuid)
    // .then(data => {
    //   debug('calibrationRxMessage: ' + data.toString('hex'));

    const message = new GlucoseTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid)//;
//   })
    .then(data => {
      const glucoseMessage = new GlucoseRxMessage(data);
      const glucose = new Glucose(glucoseMessage, timeMessage, syncDate);
      this.emit('glucose', glucose);
    });
  })
  // TODO: after sending a glucose request 0x30, we should send a calibration data request (0x32)
  // TODO: have a think about what to do when an error occurs:
  // we want to catch it, and set notify to false regardless of the result
  // but prob return the rejected promise???
  .catch(reason => debug(reason))
  .then(() => {
    return manager.setNotifyEnabledAndWait(false, uuid);
  });
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
