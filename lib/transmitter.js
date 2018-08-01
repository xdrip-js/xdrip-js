const crypto = require('crypto');
const { EventEmitter } = require('events');
const debug = require('debug')('transmitter');

const BluetoothManager = require('./bluetooth-manager');
// const BackfillParser = require('./backfill-parser');

// auth messages
const AuthRequestTxMessage = require('./messages/auth-request-tx-message'); //     0x01, 0x02
const AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message'); //       0x03
const AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message'); //       0x04
const AuthStatusRxMessage = require('./messages/auth-status-rx-message'); //             0x05
const KeepAliveTxMessage = require('./messages/keep-alive-tx-message'); //               0x06
const BondRequestTxMessage = require('./messages/bond-request-tx-message'); //           0x07
// const BondRequestRxMessage = require('./messages/bond-request-rx-message'); //           0x08

// control messages
<<<<<<< HEAD
const DisconnectTxMessage = require('./messages/disconnect-tx-message'); //              0x09
const BatteryStatusTxMessage = require('./messages/battery-status-tx-message'); //       0x22
const BatteryStatusRxMessage = require('./messages/battery-status-rx-message'); //       0x23
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message'); //   0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message'); //   0x25
const SessionStartTxMessage = require('./messages/session-start-tx-message'); //         0x26
const SessionStartRxMessage = require('./messages/session-start-rx-message'); //         0x27
const SessionStopTxMessage = require('./messages/session-stop-tx-message'); //           0x28
const SessionStopRxMessage = require('./messages/session-stop-rx-message'); //           0x29
const SensorTxMessage = require('./messages/sensor-tx-message'); //                      0x2e
const SensorRxMessage = require('./messages/sensor-rx-message'); //                      0x2f
=======
const DisconnectTxMessage = require('./messages/disconnect-tx-message');              // 0x09
const BatteryStatusTxMessage = require('./messages/battery-status-tx-message');       // 0x22
const BatteryStatusRxMessage = require('./messages/battery-status-rx-message');       // 0x23
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message');   // 0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message');   // 0x25
// session-start-tx-message 0x26 in constructor below                                 // 0x26
const SessionStartRxMessage = require('./messages/session-start-rx-message');         // 0x27
const SessionStopTxMessage = require('./messages/session-stop-tx-message');           // 0x28
const SessionStopRxMessage = require('./messages/session-stop-rx-message');           // 0x29
const SensorTxMessage = require('./messages/sensor-tx-message');                      // 0x2e
const SensorRxMessage = require('./messages/sensor-rx-message');                      // 0x2f
>>>>>>> 5d12b56e4045a32b7666d7961020b850bdc86648
// Added support for g6 if serial number starts with 8xxxxx
const GlucoseTxMessage = require('./messages/glucose-tx-message'); //              0x30, 0x4e
const GlucoseRxMessage = require('./messages/glucose-rx-message'); //              0x31, 0x4f

const CalibrationDataTxMessage = require('./messages/calibration-data-tx-message'); //   0x32
const CalibrationDataRxMessage = require('./messages/calibration-data-rx-message'); //   0x33
const CalibrateGlucoseTxMessage = require('./messages/calibrate-glucose-tx-message'); // 0x34
const CalibrateGlucoseRxMessage = require('./messages/calibrate-glucose-rx-message'); // 0x35
const ResetTxMessage = require('./messages/transmitter-reset-tx-message'); //            0x42
const ResetRxMessage = require('./messages/transmitter-reset-rx-message'); //            0x43
// const VersionRequestTxMessage = require('./messages/version-request-tx-message'); //     0x4a
// const VersionRequestRxMessage = require('./messages/version-request-rx-message'); //     0x4b
// const BackfillTxMessage = require('./messages/backfill-tx-message'); //                  0x50
// const BackfillRxMessage = require('./messages/backfill-rx-message'); //                  0x51

const Glucose = require('./glucose');
const { CGMServiceCharacteristic: uuid } = require('./bluetooth-services');

function encrypt(buffer, id) {
  const algorithm = 'aes-128-ecb';
  const cipher = crypto.createCipheriv(algorithm, `00${id}00${id}`, '');
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return encrypted;
}

<<<<<<< HEAD
function calculateHash(data, id) {
  if (data.length !== 8) {
    throw Error('cannot hash');
=======
  id_first = this.id.substr(0,1);
  // if serial number starts with 8xxxxx then assume g6 
  if (id_first == "8") {
      this.g6_transmitter = true;
      this.SessionStartTxMessage = require('./messages/g6/session-start-tx-message'); // 0x26 - g6 
  } else {
      this.SessionStartTxMessage = require('./messages/g5/session-start-tx-message'); // 0x26 - g5
>>>>>>> 5d12b56e4045a32b7666d7961020b850bdc86648
  }

  const doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  const encrypted = encrypt(doubleData, id);
  return Buffer.allocUnsafe(8).fill(encrypted);
}

async function authenticate() {
  const message = new AuthRequestTxMessage();
  try {
    await this.manager.writeValueAndWait(message.data, uuid.Authentication);
  } catch (error) {
    throw new Error(`Error writing transmitter challenge: ${error}`);
  }

  let authResponse;
  try {
    const data = await this.manager.readValueAndWait(uuid.Authentication,
      AuthChallengeRxMessage.opcode);
    authResponse = new AuthChallengeRxMessage(data);
  } catch (error) {
    throw new Error(`Unable to parse auth challenge: ${error}`);
  }

  if (!authResponse.tokenHash.equals(calculateHash(message.singleUseToken, this.id))) {
    throw new Error('Transmitter failed auth challenge');
  }

  let challengeHash;
  try {
    challengeHash = calculateHash(authResponse.challenge, this.id);
  } catch (error) {
    throw new Error('Failed to compute challenge hash for transmitter ID');
  }

  try {
    const txMessage = new AuthChallengeTxMessage(challengeHash);
    await this.manager.writeValueAndWait(txMessage.data, uuid.Authentication);
  } catch (error) {
    throw new Error(`Error writing challenge response: ${error}`);
  }

  let status;
  try {
    const data = await this.manager.readValueAndWait(uuid.Authentication,
      AuthStatusRxMessage.opcode);
    status = new AuthStatusRxMessage(data);
    debug(`transmitter responded with status message ${data.toString('hex')}`);
  } catch (error) {
    throw new Error(`Unable to parse auth status: ${error}`);
  }

  if (status.authenticated !== 1) {
    throw new Error('transmitter rejected auth challenge');
  }

  return status;
}

/*
  messages are of the form
  {
    date,
    type,
    [glucose]
  }
*/

// async function processBackfill() {
//   // if (true) { // TODO: test whether we need to ask for backfill
//   //   return Promise.resolve('No need to backfill, returning.');
//   // }
//   return Promise.resolve('No need to backfill, returning.');
//   // TODO: complete implementation
//   // const parser = new BackfillParser(/* callback */);
//   // const backfillMessage = new BackfillTxMessage();
//   // const data = await this.manager.writeValueAndWaitForNotification(
//   //   backfillMessage.data, uuid, BackfillRxMessage.opcode)
//   // return new BackfillRxMessage(data);
// }

async function requestBond() {
  try {
    await this.manager.writeValueAndWait(new KeepAliveTxMessage(25).data, uuid.Authentication);
  } catch (error) {
    throw new Error(`Error writing keep-alive for bond: ${error}`);
  }

  try {
    await this.manager.writeValueAndWait(new BondRequestTxMessage().data, uuid.Authentication);
  } catch (error) {
    throw new Error(`Error writing bond request: ${error}`);
  }
}

async function enableNotify(shouldWaitForBond = false) {
  try {
    if (shouldWaitForBond) {
      await this.manager.setNotifyEnabledAndWait(true, uuid.Control, 15000);
    } else {
      await this.manager.setNotifyEnabledAndWait(true, uuid.Control);
    }
  } catch (error) {
    throw new Error(`Error enabling notification: ${error}`);
  }
}

async function readTimeMessage() {
  try {
    const message = new TransmitterTimeTxMessage();
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
    return new TransmitterTimeRxMessage(data);
  } catch (error) {
    throw new Error(`Error getting time: ${error}`);
  }
}

async function sendCommand(command, activationDate) {
  let txMessage;
  switch (command.type) {
    case 'StartSensor': {
      const startTime = (command.date - activationDate) / 1000;
      txMessage = new SessionStartTxMessage(startTime);
      break;
    }
    case 'StopSensor': {
      const stopTime = (command.date - activationDate) / 1000;
      txMessage = new SessionStopTxMessage(stopTime);
      break;
    }
    case 'CalibrateSensor': {
      const time = (command.date - activationDate) / 1000;
      txMessage = new CalibrateGlucoseTxMessage(command.glucose, time);
      break;
    }
    case 'ResetTx': {
      txMessage = new ResetTxMessage();
      break;
    }
    case 'BatteryStatus': {
      txMessage = new BatteryStatusTxMessage();
      break;
    }
    default:
      // do nothing
  }

  const data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

  let rxMessage;
  switch (command.type) {
    case 'StartSensor': {
      rxMessage = new SessionStartRxMessage(data);
      break;
    }
    case 'StopSensor': {
      rxMessage = new SessionStopRxMessage(data);
      break;
    }
    case 'CalibrateSensor': {
      rxMessage = new CalibrateGlucoseRxMessage(data);
      break;
    }
    case 'ResetTx': {
      rxMessage = new ResetRxMessage(data);
      break;
    }
    case 'BatteryStatus': {
      rxMessage = new BatteryStatusRxMessage(data);
      this.emit('batteryStatus', rxMessage);
      debug('got BatteryStatus Rx');
      break;
    }
    default:
      // do nothing
  }

  if (rxMessage) {
    debug(`got message: ${rxMessage}`);
  }
  this.emit('messageProcessed', { time: command.date });
}

async function readGlucose() {
  try {
    const message = new GlucoseTxMessage(this.g6Transmitter);
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
    return new GlucoseRxMessage(data, this.g6_transmitter);
  } catch (error) {
    throw new Error(`Error getting glucose: ${error}`);
  }
}

async function readSensorMessage() {
  try {
    const message = new SensorTxMessage();
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
    return new SensorRxMessage(data, this.g6_transmitter);
  } catch (error) {
    throw new Error(`Error getting sensor message: ${error}`);
  }
}

<<<<<<< HEAD
async function readCalibrationData() {
  try {
    const message = new CalibrationDataTxMessage();
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
    return new CalibrationDataRxMessage(data);
  } catch (error) {
    throw new Error(`Error getting calibration data: ${error}`);
=======
// messages are of the form
// {
//   date,
//   type,
//   [glucose],
//   [sensorSerialCode] // 4 digit string serial code valid only for g6
// }
function processMessages(messages, uuid, syncDate, timeMessage) {
  let promise = Promise.resolve();
  while (messages.length) {
    const message = messages.shift();
    const messageTimeInDexSeconds = timeMessage.currentTime - Math.floor((syncDate - message.date)/1000);
    promise = promise.then(() => {
      switch (message.type) {
        case "StartSensor":
          if (this.g6_sensor) {
            sessionStartMessage = new this.SessionStartTxMessage(messageTimeInDexSeconds, message.sensorSerialCode);
          } else {
            sessionStartMessage = new this.SessionStartTxMessage(messageTimeInDexSeconds);
          }
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
        case "ResetTx":
          const resetTxMessage = new ResetTxMessage();
          return manager.writeValueAndWaitForNotification(resetTxMessage.data, uuid)
          .then(data => new ResetRxMessage(data));
        case "BatteryStatus":
          const batteryStatusTxMessage = new BatteryStatusTxMessage();
          return manager.writeValueAndWaitForNotification(batteryStatusTxMessage.data, uuid)
          .then(data => new BatteryStatusRxMessage(data));
      }
    })
    .then(rxMessage => {
      switch (message.type) {
        case "BatteryStatus":
          this.emit('batteryStatus', rxMessage);
          console.log("got BatteryStatus Rx");
        }
      this.emit('messageProcessed', {time: message.date});
      console.log("got message:\n", rxMessage);
    });
>>>>>>> 5d12b56e4045a32b7666d7961020b850bdc86648
  }
}

async function disconnect() {
  try {
    await this.manager.setNotifyEnabledAndWait(false, uuid.Control);
    const message = new DisconnectTxMessage();
    await this.manager.writeValueAndWait(message.data, uuid.Control);
  } catch (error) {
    debug(error);
  }
}

module.exports = class Transmitter extends EventEmitter {
  constructor(id, getMessages = (() => [])) {
    debug(`Listening for transmitter ${id}`);
    super();
    this.id = id;
    this.getMessages = getMessages;

    // if serial number starts with 8xxxxx then assume g6
    this.g6Transmitter = (id.substr(1) === '8');
    this.manager = new BluetoothManager(this);
  }

  shouldConnect(peripheral) {
    const name = peripheral.advertisement.localName;

    if (!name) {
      return false;
    }

    if (name.substr(-2) === this.id.substr(-2)) {
      this.rssi = peripheral.rssi;
      this.emit('sawTransmitter', { id: this.id, rssi: peripheral.rssi });
      return true;
    }
    return false;
  }

  async isReady() { // TODO: perhaps change the name to onReady, or go?
    try {
      debug('Authenticating with transmitter');
      const status = await authenticate.call(this);

      if (status.bonded !== 0x1) {
        debug('Requesting bond');
        await requestBond.call(this);

        debug('Bonding request sent. Waiting for user to respond.');
      }

      await enableNotify.call(this, status.bonded !== 0x1);

      debug('Reading time');
      const timeMessage = await readTimeMessage.call(this);

      const activationDate = new Date(Date.now() - timeMessage.currentTime * 1000);
      debug(`Determined activation date: ${activationDate}`);

      const sessionStartDate = (timeMessage.sessionStartTime < 0xffffffff)
        ? new Date(activationDate + timeMessage.sessionStartTime * 1000) : null;
      debug(`Determined session start date: ${sessionStartDate}`);

      // const syncDate = Date.now();
      const messages = await this.getMessages();
      while (messages.length) {
        const message = messages.shift();
        debug(`Sending command: ${message.type}`);

        try {
          // eslint-disable-next-line no-await-in-loop
          await sendCommand.call(this, message, activationDate);
          // TODO: notify command source that the operation has completed
        } catch (error) {
          // TODO: notify the command source of the error
        }
      }

      debug('Reading glucose');
      const glucoseMessage = await readGlucose.call(this);

      debug('Reading sensor message');
      const sensorMessage = await readSensorMessage.call(this);

      const glucose = new Glucose(glucoseMessage,
        timeMessage, activationDate, sensorMessage, this.rssi);
      this.emit('glucose', glucose);

      debug('Reading calibration data');
      const calibrationMessage = await readCalibrationData.call(this);

      const calibrationData = {
        date: activationDate + calibrationMessage.timestamp * 1000,
        glucose: calibrationMessage.glucose,
      };
      this.emit('calibrationData', calibrationData);
      // try {
      //   await processBackfill.call(this);
      // } catch (error) {
      //   debug(error);
      // }
    } catch (error) {
      debug(error);
    } finally {
      debug('Initiating a disconnect');
      await disconnect.call(this);
    }
  }

  didDisconnect() {
    this.emit('disconnect');
  }
};

// function processVersion() {
//   if (true) { // TODO: test for currency of version information
//     return Promise.resolve("Version info up to date, returning.");
//   } else {
//     const message = new VersionRequestTxMessage();
//     return manager.writeValueAndWaitForNotification(message.data, uuid)
//     .then(data => debug('version: ' + data.toString('hex')));
//   }
// }
//
