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
const UUID = require('./bluetooth-services');

function encrypt(buffer, id) {
  const algorithm = 'aes-128-ecb';
  const cipher = crypto.createCipheriv(algorithm, `00${id}00${id}`, '');
  const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
  return encrypted;
}

function calculateHash(data, id) {
  if (data.length !== 8) {
    throw Error('cannot hash');
  }

  const doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  const encrypted = encrypt(doubleData, id);
  return Buffer.allocUnsafe(8).fill(encrypted);
}

async function authenticate() {
  const uuid = UUID.CGMServiceCharacteristic.Authentication;

  const message = new AuthRequestTxMessage();
  try {
    await this.manager.writeValueAndWait(message.data, uuid);
  } catch (error) {
    throw new Error(`Error writing transmitter challenge: ${error}`);
  }

  let authResponse;
  try {
    const data = await this.manager.readValueAndWait(uuid, AuthChallengeRxMessage.opcode);
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
    await this.manager.writeValueAndWait(new AuthChallengeTxMessage(challengeHash).data, uuid);
  } catch (error) {
    throw new Error(`Error writing challenge response: ${error}`);
  }

  let status;
  try {
    const data = await this.manager.readValueAndWait(uuid, AuthStatusRxMessage.opcode);
    status = new AuthStatusRxMessage(data);
    debug(`transmitter responded with status message ${data.toString('hex')}`);
  } catch (error) {
    throw new Error(`Unable to parse auth status: ${error}`);
  }

  if (status.authenticated !== 1) {
    throw new Error('transmitter rejected auth challenge');
  }

  // TODO: CGMBLEKit stops here and returns. Consider doing the same.

  try {
    await this.manager.writeValueAndWait(new KeepAliveTxMessage(25).data, uuid);
  } catch (error) {
    throw new Error(`Error writing keep-alive for bond: ${error}`);
  }

  if (status.bonded === 1) {
    debug('transmitter already bonded');
    return;
  }

  try {
    await this.manager.writeValueAndWait(new BondRequestTxMessage().data, uuid);
  } catch (error) {
    throw new Error(`Error writing bond request: ${error}`);
  }
}

/*
  messages are of the form
  {
    date,
    type,
    [glucose]
  }
*/
async function processMessages(messages, uuid, syncDate, timeMessage) {
  while (messages.length) {
    const message = messages.shift();
    const messageTimeInDexSeconds = timeMessage.currentTime
      - Math.floor((syncDate - message.date) / 1000);

    let txMessage;
    switch (message.type) {
      case 'StartSensor': {
        txMessage = new SessionStartTxMessage(messageTimeInDexSeconds);
        break;
      }
      case 'CalibrateSensor': {
        txMessage = new CalibrateGlucoseTxMessage(
          message.glucose,
          messageTimeInDexSeconds,
        );
        break;
      }
      case 'StopSensor': {
        txMessage = new SessionStopTxMessage(messageTimeInDexSeconds);
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

    // eslint-disable-next-line no-await-in-loop
    const data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid);

    let rxMessage;
    switch (message.type) {
      case 'StartSensor': {
        rxMessage = new SessionStartRxMessage(data);
        break;
      }
      case 'CalibrateSensor': {
        rxMessage = new CalibrateGlucoseRxMessage(data);
        break;
      }
      case 'StopSensor': {
        rxMessage = new SessionStopRxMessage(data);
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

    this.emit('messageProcessed', { time: message.date });
  }
}

async function processBackfill() {
  // if (true) { // TODO: test whether we need to ask for backfill
  //   return Promise.resolve('No need to backfill, returning.');
  // }
  return Promise.resolve('No need to backfill, returning.');
  // TODO: complete implementation
  // const parser = new BackfillParser(/* callback */);
  // const backfillMessage = new BackfillTxMessage();
  // const data = await this.manager.writeValueAndWaitForNotification(
  //   backfillMessage.data, uuid, BackfillRxMessage.opcode)
  // return new BackfillRxMessage(data);
}

async function control(messages) {
  const uuid = UUID.CGMServiceCharacteristic.Control;

  await this.manager.setNotifyEnabledAndWait(true, uuid);

  // TODO: figure out if we need this
  // update tranmitter version, if necessary
  // .then(processVersion.bind(this)).then(debug)
  // send tranmitter time tx message

  let timeMessage;
  try {
    const message = new TransmitterTimeTxMessage();
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid);
    timeMessage = new TransmitterTimeRxMessage(data);
  } catch (error) {
    throw new Error(`Error getting time: ${error}`);
  }

  const syncDate = Date.now();

  await processMessages.call(this, messages, uuid, syncDate, timeMessage);

  let glucoseMessage;
  try {
    const message = new GlucoseTxMessage(this.g6Transmitter);
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid);
    glucoseMessage = new GlucoseRxMessage(data, this.g6_transmitter);
  } catch (error) {
    // TODO: throw
  }

  let sensorMessage;
  try {
    const message = new SensorTxMessage();
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid);
    sensorMessage = new SensorRxMessage(data, this.g6_transmitter);
  } catch (error) {
    // don't worry about it, just pass null
    sensorMessage = null;
  }

  const glucose = new Glucose(glucoseMessage, timeMessage, syncDate, sensorMessage);
  debug(`Transmitter activation date: ${new Date(glucose.transmitterStartDate)}`);
  glucose.rssi = this.rssi;
  this.emit('glucose', glucose);

  let calibrationMessage;
  try {
    const message = new CalibrationDataTxMessage();
    const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid);
    calibrationMessage = new CalibrationDataRxMessage(data);
  } catch (error) {
    // TODO: throw
  }

  const calibrationData = {
    date: syncDate - (timeMessage.currentTime - calibrationMessage.timestamp) * 1000,
    glucose: calibrationMessage.glucose,
  };
  this.emit('calibrationData', calibrationData);

  await this.manager.setNotifyEnabledAndWait(false, uuid);

  try {
    await processBackfill.call(this);
  } catch (error) {
    debug(error);
  }

  try {
    const message = new DisconnectTxMessage();
    await this.manager.writeValueAndWait(message.data, uuid);
  } catch (error) {
    debug(error);
  }
}

module.exports = class Transmitter extends EventEmitter {
  constructor(id, getMessages = (() => [])) {
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
    // TODO: control proceeds whether or not auth was successful. Fix.
    try {
      await authenticate.call(this);
      const messages = await this.getMessages();
      await control.call(this, messages);
    } catch (error) {
      debug(error);
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
