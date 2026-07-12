const crypto = require('crypto');
const { setTimeout: sleep } = require('timers/promises');
const { EventEmitter } = require('events');
const debug = require('debug')('transmitter');

const BluetoothManager = require('./bluetooth-manager');
const BackfillParser = require('./backfill-parser');
const Plugin = require('./keks_plugin/plugin');
const SerialOperationQueue = require('./serial-operation-queue');

// auth messages
const AuthRequestTxMessage = require('./messages/auth-request-tx-message'); //     0x01, 0x02
const AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message'); //       0x03
const AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message'); //       0x04
const AuthStatusRxMessage = require('./messages/auth-status-rx-message'); //             0x05
const KeepAliveTxMessage = require('./messages/keep-alive-tx-message'); //               0x06
const BondRequestTxMessage = require('./messages/bond-request-tx-message'); //           0x07
const BondRequestRxMessage = require('./messages/bond-request-rx-message'); //           0x08

// control messages
const DisconnectTxMessage = require('./messages/disconnect-tx-message'); //              0x09
const BatteryStatusTxMessage = require('./messages/battery-status-tx-message'); //       0x22
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message'); //   0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message'); //   0x25
// session-start-tx-message 0x26 in constructor below                                    0x26
const SessionStartRxMessage = require('./messages/session-start-rx-message'); //         0x27
const SessionStopTxMessage = require('./messages/session-stop-tx-message'); //           0x28
const SessionStopRxMessage = require('./messages/session-stop-rx-message'); //           0x29
const SensorTxMessage = require('./messages/sensor-tx-message'); //                      0x2e
const SensorRxMessage = require('./messages/sensor-rx-message'); //                      0x2f
// Added support for g6 if serial number starts with 8xxxxx
const GlucoseTxMessage = require('./messages/glucose-tx-message'); //              0x30, 0x4e
const GlucoseRxMessage = require('./messages/glucose-rx-message'); //              0x31, 0x4f

const CalibrationDataTxMessage = require('./messages/calibration-data-tx-message'); //   0x32
// calibration-data-rx-message 0x33 in constructor below
const CalibrateGlucoseTxMessage = require('./messages/calibrate-glucose-tx-message'); // 0x34
const CalibrateGlucoseRxMessage = require('./messages/calibrate-glucose-rx-message'); // 0x35
const ResetTxMessage = require('./messages/transmitter-reset-tx-message'); //            0x42
const ResetRxMessage = require('./messages/transmitter-reset-rx-message'); //            0x43
const AnubisTxResetDefaultMessage = require('./messages/g6/anubis-tx-reset-default-message'); // 0xf080
const AnubisTxResetExtendedMessage = require('./messages/g6/anubis-tx-reset-extended-message'); // 0xf080
const AnubisTxStatusMessage = require('./messages/g6/anubis-tx-status-message'); //      0x3b
const VersionRequestTxMessage = require('./messages/version-request-tx-message'); // 0x20, 0x4a, 0x52
const VersionRequestRx0Message = require('./messages/version-request-rx-0-message'); //  0x21
const VersionRequestRx1Message = require('./messages/version-request-rx-1-message'); //  0x4b
const VersionRequestRx2Message = require('./messages/version-request-rx-2-message'); //  0x53
const BackfillTxMessage = require('./messages/backfill-tx-message'); //                  0x50
const BackfillTxMessage2 = require('./messages/backfill-tx-message2'); //                0x59
const BackfillRxMessage = require('./messages/backfill-rx-message'); //                  0x51
const D0UnknownRxMessage = require('./messages/d0-unknown-rx-message');

const Glucose = require('./glucose');
const { CGMServiceCharacteristic: uuid } = require('./bluetooth-services');

// added boolean argument #3 - true if xdrip-js is to use receiver bt channel
module.exports = class Transmitter extends EventEmitter {
  constructor(id, getMessages = (() => []), altBt = false, sensorKey = null, macAddress = null) {
    debug(`Listening for transmitter ${id}`);
    super();

    // used to serialize doNext execution
    this.doNextQueue = new SerialOperationQueue('doNext', 0);
    this.id = id;
    this.alternateBluetoothChannel = altBt;
    this.getMessages = getMessages;
    this.savedMacAddress = macAddress;
    this.g7Transmitter = false;

    if (Transmitter.g7TxId(this.id)) {
      this.plugin = Plugin.getInstance(id); // tx ID is the password for the keks plugin
      this.plugin.setPersistence(2, sensorKey);
      this.g7Transmitter = true;
    }

    // if serial number starts with 8xxxxx then assume g6
    this.g6Transmitter = (id.substr(0, 1) === '8');
    const g6Type = id.substr(0, 2);
    this.g6PlusTransmitter = (g6Type === '8G' || g6Type === '8H' || g6Type === '8J' || g6Type === '8L' || g6Type === '8R');

    if (this.maxRuntimeDays > 120) {
      this.g6AnubisTransmitter = true;
    }

    this.SessionStartTxMessage = (this.g6Transmitter)
      ? require('./messages/g6/session-start-tx-message') // eslint-disable-line global-require
      : require('./messages/g5/session-start-tx-message'); // eslint-disable-line global-require

    this.CalibrationDataRxMessage = (this.g6Transmitter)
      ? require('./messages/g6/calibration-data-rx-message') // eslint-disable-line global-require
      : require('./messages/g5/calibration-data-rx-message'); // eslint-disable-line global-require

    this.BatteryStatusRxMessage = (this.g6PlusTransmitter || this.g6AnubisTransmitter)
      ? require('./messages/g6/battery-status-rx-message') // eslint-disable-line global-require
      : require('./messages/g5/battery-status-rx-message'); // eslint-disable-line global-require

    this.manager = new BluetoothManager(this);
  }

  static encrypt(buffer, id) {
    const algorithm = 'aes-128-ecb';
    const cipher = crypto.createCipheriv(algorithm, `00${id}00${id}`, '');
    const encrypted = Buffer.concat([cipher.update(buffer), cipher.final()]);
    return encrypted;
  }

  static calculateHash(data, id) {
    if (data.length !== 8) {
      throw Error('cannot hash');
    }

    const doubleData = Buffer.allocUnsafe(16);
    doubleData.fill(data, 0, 8);
    doubleData.fill(data, 8, 16);

    const encrypted = Transmitter.encrypt(doubleData, id);
    return Buffer.allocUnsafe(8).fill(encrypted);
  }

  // returns true if this is G7 transmitter based on txId length
  static g7TxId(id) {
    if (id.length < 6) {
      return true;
    }

    return false;
  }

  async doNext(caller) {
    debug(`Entered doNext from ${caller}`);

    const p = this.plugin.aNext();

    if (!p) {
      debug('KEKS Plugin aNext() returned null');
    }

    const cmd = p[0];

    if (p.length === 2) {
      const data = p[1];

      if (data !== null) {
        const len = data.length;
        for (let i = 0; i < len; i += 20) {
          const size = Math.min(20, len - 1);

          const bytesToSend = data.subarray(i, i + size);

          // eslint-disable-next-line no-await-in-loop
          await this.manager.writeValueNoWait(bytesToSend, uuid.ExtraData, 5);
        }

        await sleep(500);
      }

      if (cmd !== null) {
        debug(`doNext: sending command ${p[0].toString('hex')} to Authentication UUID`);
        await this.manager.writeValueAndWait(p[0], uuid.Authentication);
      }
    } else if (p.length === 1) {
      debug(`ready to receive data! Plugin in state ${Plugin.stateToName(this.plugin.state)}`);
      await this.manager.writeValueAndWait(p[0], uuid.Authentication);
    } else if (p.length === 3) {
      /*
       * TODO I believe this is used for saving the bond information
       * it doesn't have to be rebonded on every read
       */
      /*
      parent.savePersist();
      */
      debug('NEED TO SAVE PERSISTENT DATA');
      if (await this.manager.isDevicePaired()) {
        await this.manager.unpairDevice();

        /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
        while (!(await this.manager.isDevicePaired())) {
          await sleep(100);
        }
        /* eslint-enable no-await-in-loop */
      } else {
        debug('Device does not appear to be bonded?');
      }
    }
  }

  async authenticate2() {
    this.plugin.amConnected();

    debug('Setting callback for ExtraData');
    await this.manager.setupNotification(uuid.ExtraData, async (data) => {
      debug('received ExtraData data');

      if (this.plugin.receivedData(data)) {
        await this.doNextQueue.enqueue({
          operationName: 'doNext',

          executor: async () => {
            await this.doNext('ExtraData callback');
          },
        });
      }
    });

    debug('Setting notify for uuid.Authentication');
    await this.manager.setupNotification(uuid.Authentication);

    debug('Setting notify for ExtraData');
    await this.manager.setNotifyEnabledAndWait(true, uuid.ExtraData);

    // call doNext as soon as the notification is enabled
    await this.doNextQueue.enqueue({
      operationName: 'doNext',

      executor: async () => {
        await this.doNext('Initial doNext call');
      },
    });

    let previousValueHex = '';
    let bonded = false;

    /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
    while (!bonded) {
      const data = await this.manager.readValueAndWait(uuid.Authentication, null);
      const currentValueHex = data.toString('hex');

      if (currentValueHex !== previousValueHex) {
        previousValueHex = currentValueHex;

        debug(`Authentication changed: ${currentValueHex}`);

        const bondNow = Plugin.bondNow(data);

        if (bondNow && !bonded) {
          // debug('Creating bond!');
          // bonded = await this.manager.createBond();
          // debug('Creating bond complete!');

          bonded = await this.requestBondG7();
        }

        if (this.plugin.receivedResponse(data)) {
          await this.doNextQueue.enqueue({
            operationName: 'doNext',

            executor: async () => {
              await this.doNext('receivedResponse loop');
            },
          });
        }
      }
    }
    /* eslint-enable no-await-in-loop */
  }

  async requestBondG7() {
    let bonded = false;

    debug('Requesting bond');
    try {
      const respMsg = await this.manager.writeValueAndWait(
        new BondRequestTxMessage().data,
        uuid.Authentication,
      );

      debug(`requested bond: ${respMsg ? respMsg[0] : ''}`);
    } catch (error) {
      throw new Error(`Error writing bond request: ${error}`);
    }
    debug('Bonding request sent. Waiting for user to respond.');

    while (!bonded) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const data = await this.manager.readValueAndWait(
          uuid.Authentication,
        );

        if (data[0] === BondRequestTxMessage.opcode) {
          debug('Transmitter is attempting bond!');
        }
        if (data[0] === BondRequestRxMessage.opcode) {
          debug('Transmitter says bond complete!');
          bonded = true;
        } else {
          debug(`this was not the bond request rx message we were looking for ${data.toString('hex')}`);
          return false;
        }
      } catch (error) {
        throw new Error(`Error waiting for message: ${error}`);
      }
    }

    return bonded;
  }

  async authenticate() {
    const message = new AuthRequestTxMessage(this.alternateBluetoothChannel);
    try {
      await this.manager.writeValueAndWait(message.data, uuid.Authentication);
    } catch (error) {
      throw new Error(`Error writing transmitter challenge: ${error}`);
    }

    let authResponse;
    try {
      const data = await this.manager.readValueAndWait(
        uuid.Authentication,
        AuthChallengeRxMessage.opcode,
      );
      authResponse = new AuthChallengeRxMessage(data);
    } catch (error) {
      throw new Error(`Unable to parse auth challenge: ${error}`);
    }

    if (!authResponse.tokenHash.equals(
      Transmitter.calculateHash(message.singleUseToken, this.id),
    )) {
      throw new Error('Transmitter failed auth challenge');
    }

    let challengeHash;
    try {
      challengeHash = Transmitter.calculateHash(authResponse.challenge, this.id);
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
      const data = await this.manager.readValueAndWait(
        uuid.Authentication,
        AuthStatusRxMessage.opcode,
      );
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
      [glucose],
      [sensorSerialCode] // 4 digit string serial code valid only for g6
    }
  */
  async processVersion() {
    let txMessage = new VersionRequestTxMessage(0);
    let data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

    let rxMessage = new VersionRequestRx0Message(data);
    this.firmwareData = { };
    this.firmwareData.status = rxMessage.status;
    this.firmwareData.firmwareVersion = rxMessage.firmwareVersion;
    this.firmwareData.btFirmwareVersion = rxMessage.btFirmwareVersion;
    this.firmwareData.hardwareRev = rxMessage.hardwareRev;
    this.firmwareData.otherFirmwareVersion = rxMessage.otherFirmwareVersion;
    this.firmwareData.asic = rxMessage.asic;

    txMessage = new VersionRequestTxMessage(1);
    data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

    rxMessage = new VersionRequestRx1Message(data);
    this.firmwareData.status = rxMessage.status;
    this.firmwareData.firmwareVersion = rxMessage.firmwareVersion;
    this.firmwareData.buildVersion = rxMessage.buildVersion;
    this.firmwareData.inactiveDays = rxMessage.inactiveDays;
    this.firmwareData.maxRuntimeDays = rxMessage.maxRuntimeDays;
    this.firmwareData.maxInactiveDays = rxMessage.maxInactiveDays;

    txMessage = new VersionRequestTxMessage(2);
    data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

    rxMessage = new VersionRequestRx2Message(data);
    this.firmwareData.status = rxMessage.status;
    this.firmwareData.typicalSensorDays = rxMessage.typicalSensorDays;
    this.firmwareData.featureBits = rxMessage.featureBits;
    debug(`got version messages: ${this.firmwareData.firmwareVersion}`);

    this.emit('version', this.firmwareData);

    debug(`messageProcessed: ${this.getVersionDate}`);
    this.emit('messageProcessed', { time: this.getVersionDate });

    return null;
  }

  async processBackfill() {
    let backfillMessage;

    if (this.backfill) {
      const ONE_HOUR = 60 * 60 * 1000; /* ms */
      const elapsedMs = new Date() - this.activationDate.getTime();
      const THREE_HOURS_AGO_DEX = (elapsedMs - 3 * ONE_HOUR) / 1000;
      // On the G5 the maxiumum backfill is 3 hours limit it for safety.
      if (this.backfill_start < THREE_HOURS_AGO_DEX) {
        this.backfill_start = THREE_HOURS_AGO_DEX;
      }
      debug(`Will request backfill since ${this.backfill_start} = ${new Date(this.activationDate.getTime() + this.backfill_start * 1000)}`);
      debug(`Will request backfill until ${this.backfill_end} = ${new Date(this.activationDate.getTime() + this.backfill_end * 1000)}`);

      // prepare the backfill message with start and end times.
      if (Transmitter.g7TxId(this.id)) {
        backfillMessage = new BackfillTxMessage(this.backfill_start, this.backfill_end);
      } else {
        backfillMessage = new BackfillTxMessage2(this.backfill_start, this.backfill_end);
      }
      debug(`Requesting backfill ${JSON.stringify(backfillMessage)}`);

      // setup a backfill parser
      this.parser = new BackfillParser(this.activationDate);
      const backfillParser = this.parser;

      // setup callback notifications on the Backfill characteristing.
      await this.manager.setupNotification(uuid.Backfill, (data) => backfillParser.push(data));
      // enable notify on the Backfill characteristic
      await this.manager.setNotifyEnabledAndWait(true, uuid.Backfill);

      // TODO: Somewhere we receive a BackFillControlMessage

      // Send the BackfillTxMessage and receive a BackfillRxMesssage.
      // This should start trigerring callbacks on notification setup above.
      const data = await this.manager.writeValueAndWaitForNotification(
        backfillMessage.data,
        uuid.Control,
      );
      debug(`BackfillTxMessage data ${data.toString('hex')}`);
      const msg = new BackfillRxMessage(data);
      debug(`BackfillRxMessage response ${JSON.stringify(msg)}`);
      this.parser.setBackfillRxMessage(msg);

      return msg;
    }

    debug('no backfill needed');
    return null;
  }

  async requestBond() {
    try {
      await this.manager.writeValueAndWait(new KeepAliveTxMessage(60).data, uuid.Authentication);
    } catch (error) {
      throw new Error(`Error writing keep-alive for bond: ${error}`);
    }

    try {
      await this.manager.writeValueAndWait(new BondRequestTxMessage().data, uuid.Authentication);
    } catch (error) {
      throw new Error(`Error writing bond request: ${error}`);
    }
  }

  async enableNotify(shouldWaitForBond = false) {
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

  async readTimeMessage() {
    try {
      const message = new TransmitterTimeTxMessage();
      let receivedTimeMessage = false;

      let data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);

      while (!receivedTimeMessage) {
        if (data[0] !== TransmitterTimeRxMessage.opcode) {
          debug('That was not a time message');
          // eslint-disable-next-line no-await-in-loop
          data = await this.manager.readValueAndWait(uuid.Control, null);
        } else {
          receivedTimeMessage = true;
        }
      }

      return new TransmitterTimeRxMessage(data);
    } catch (error) {
      throw new Error(`Error getting time: ${error}`);
    }
  }

  async sendCommand(command, activationDate) {
    let txMessage;
    switch (command.type) {
      case 'StartSensor': {
        const startTime = (command.date - activationDate) / 1000;
        txMessage = (this.g6Transmitter)
          ? new this.SessionStartTxMessage(startTime, command.sensorSerialCode)
          : new this.SessionStartTxMessage(startTime);
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
      case 'ResetTxAnubisDefault': {
        if (this.g6AnubisTransmitter) {
          txMessage = new AnubisTxResetDefaultMessage();
        }
        break;
      }
      case 'ResetTxAnubisExtended': {
        if (this.g6AnubisTransmitter) {
          txMessage = new AnubisTxResetExtendedMessage();
        }
        break;
      }
      case 'StatusTxAnubis': {
        if (this.g6AnubisTransmitter) {
          txMessage = new AnubisTxStatusMessage();
        }
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
        rxMessage = new this.BatteryStatusRxMessage(data);
        this.emit('batteryStatus', rxMessage);
        debug('got BatteryStatus Rx');
        break;
      }
      default:
        // do nothing
    }

    if (rxMessage) {
      debug('got message: ', rxMessage);
    }
    debug(`messageProcessed: ${command.date}`);
    this.emit('messageProcessed', { time: command.date });
  }

  async readGlucose() {
    try {
      const message = new GlucoseTxMessage(this.g6Transmitter);
      const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
      return new GlucoseRxMessage(data, this.g6Transmitter);
    } catch (error) {
      throw new Error(`Error getting glucose: ${error}`);
    }
  }

  async readSensorMessage() {
    try {
      const message = new SensorTxMessage();
      const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
      if (data[0] === D0UnknownRxMessage.opcode) {
        return null;
      }

      return new SensorRxMessage(data, this.g6Transmitter);
    } catch (error) {
      throw new Error(`Error getting sensor message: ${error}`);
    }
  }

  async readCalibrationData() {
    try {
      const message = new CalibrationDataTxMessage();
      const data = await this.manager.writeValueAndWaitForNotification(message.data, uuid.Control);
      return new this.CalibrationDataRxMessage(data);
    } catch (error) {
      throw new Error(`Error getting calibration data: ${error}`);
    }
  }

  async disconnect() {
    try {
      await this.manager.setNotifyEnabledAndWait(false, uuid.Control);
      const message = new DisconnectTxMessage();
      await this.manager.writeValueAndWait(message.data, uuid.Control);
    } catch (error) {
      debug(error);
    }
  }

  shouldConnect(peripheral) {
    // TODO: if we have a MAC address from a transmitter we have bound to,
    // we need to only connect to that MAC address until the id is changed
    // by the user.
    const name = peripheral.advertisement.localName;

    debug(`shouldConnect: ${name}`);

    if (!name) {
      return false;
    }

    if (Transmitter.g7TxId(this.id) && (name.substr(0, 4) === 'DXCM')) {
      debug('shouldConnect: found G7');

      this.emit('sawTransmitter', { id: this.id, rssi: peripheral.rssi, address: peripheral.address });
      return true;
    }

    if (name.substr(-2) === this.id.substr(-2)) {
      debug('shouldConnect: found matching G6');

      this.rssi = peripheral.rssi;
      this.address = peripheral.address;
      this.emit('sawTransmitter', { id: this.id, rssi: peripheral.rssi, address: peripheral.address });
      return true;
    }

    return false;
  }

  async isReady(macAddress) {
    let status;

    try {
      debug(`Authenticating with transmitter, alternate bt channel: ${this.alternateBluetoothChannel}`);
      if (!Transmitter.g7TxId(this.id)) {
        status = await this.authenticate();

        if (status.bonded !== 0x1) {
          debug('Requesting bond');
          await this.requestBond();

          debug('Bonding request sent. Waiting for user to respond.');
        }

        await this.enableNotify(status.bonded !== 0x1);
      } else {
        if (macAddress !== this.savedMacAddress) {
          // this doesn't match the MAC address
          // we saved for the key. Need to start over
          // and negotiate a key with this sensor
          this.plugin.setPersistence(2, null);
        }

        await this.authenticate2();

        const key = this.plugin.getSharedKey();

        if (key) {
          // set the shared key and mac address
          // to the application so they can be stored
          this.savedMacAddress = macAddress;
          this.emit('sensorKey', { id: this.id, key: key.toString('hex'), address: macAddress });
        }

        await this.enableNotify(false);
      }

      debug('Reading time');
      const timeMessage = await this.readTimeMessage();

      const activationDate = new Date(Date.now() - timeMessage.currentTime * 1000);
      this.activationDate = activationDate;
      debug(`Determined activation date: ${activationDate}`);

      const sessionStartDate = (timeMessage.sessionStartTime < 0xffffffff)
        ? new Date(activationDate + timeMessage.sessionStartTime * 1000) : null;
      debug(`Determined session start date: ${sessionStartDate}`);

      // const syncDate = Date.now();
      const messages = await this.getMessages();
      while (messages.length) {
        const message = messages.shift();
        if (message.type === 'Backfill') {
          this.backfill = true;
          this.backfill_date = message.date;
          this.backfill_start = (message.date - activationDate.getTime()) / 1000;
          if (message.endDate) {
            this.backfill_end = (message.endDate - activationDate.getTime()) / 1000;
          } else {
            const ONE_MIN = 60 * 1000; /* ms */
            // go one minute back to avoid duplicating the latest glucose entry.
            this.backfill_end = (new Date() - activationDate.getTime() - ONE_MIN) / 1000;
          }
        } else if (message.type === 'VersionRequest') {
          this.getVersion = true;
          this.getVersionDate = message.date;
        } else {
          debug(`Sending command: ${message.type}`);

          try {
            // eslint-disable-next-line no-await-in-loop
            await this.sendCommand(message, activationDate);
          } catch (error) {
            debug(`Error sending command: ${message.type}`);
            debug(error);
            debug(`Sending command: ${message.type}`);
            try {
              // eslint-disable-next-line no-await-in-loop
              await this.sendCommand(message, activationDate);
            } catch (error2) {
              // Even though there was an error, we want to continue on
            }
          }
        }
      }

      if (this.getVersion) {
        try {
          await this.processVersion();
        } catch (error) {
          debug(error);
        }
      }

      try {
        await this.processBackfill();
      } catch (error) {
        debug(error);
      }

      let glucoseMessage = null;
      let sensorMessage = null;

      try {
        debug('Reading glucose');
        glucoseMessage = await this.readGlucose();

        debug('Reading sensor message');
        sensorMessage = await this.readSensorMessage();

        if (this.backfill && this.parser) {
          if (this.parser.validate()) {
            debug('Parsing backfill data');
            const backfillData = this.parser.parse();
            debug(`got backfill data: ${JSON.stringify(backfillData)}`);
            this.emit('backfillData', backfillData);
          } else {
            debug('ERROR - BackfillParser in an invalid state.');
          }
          debug(`messageProcessed: ${this.backfill_date}`);
          this.emit('messageProcessed', { time: this.backfill_date });
        }
      } finally {
        // Always try to send the glucose message if one was received
        if (glucoseMessage) {
          const glucose = new Glucose(
            glucoseMessage,
            timeMessage,
            activationDate,
            sensorMessage,
            this.rssi,
          );
          this.emit('glucose', glucose);
        }
      }

      debug('Reading calibration data');
      const calibrationMessage = await this.readCalibrationData();

      const calibrationData = {
        date: new Date(activationDate.getTime() + calibrationMessage.timestamp * 1000),
        glucose: calibrationMessage.glucose,
      };
      this.emit('calibrationData', calibrationData);
    } catch (error) {
      debug(error);
    } finally {
      debug('Initiating a disconnect');
      await this.disconnect();
    }
  }

  didDisconnect() {
    this.emit('disconnect');
  }
};

// function processVersion() {
//   if (true) {
//     return Promise.resolve("Version info up to date, returning.");
//   } else {
//     const message = new VersionRequestTxMessage();
//     return manager.writeValueAndWaitForNotification(message.data, uuid)
//     .then(data => debug('version: ' + data.toString('hex')));
//   }
// }
//
