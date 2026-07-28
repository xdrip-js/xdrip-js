const crypto = require('crypto');
const { setTimeout: sleep } = require('timers/promises');
const { EventEmitter } = require('events');
const debug = require('debug')('transmitter');

const BluetoothManager = require('./bluetooth-manager');
const Plugin = require('./keks_plugin/plugin');
const SerialOperationQueue = require('./serial-operation-queue');

const BackfillParserG6 = require('./backfill-parser-g6');
const BackfillParserG7 = require('./backfill-parser-g7');

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
const BatteryStatusRxMessage = require('./messages/battery-status-rx-message');
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message'); //   0x24
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message'); //   0x25
const SessionStartTxMessage = require('./messages/session-start-tx-message');
const SessionStartRxMessage = require('./messages/session-start-rx-message'); //         0x27
const SessionStopTxMessage = require('./messages/session-stop-tx-message'); //           0x28
const SessionStopRxMessage = require('./messages/session-stop-rx-message'); //           0x29
const SensorTxMessage = require('./messages/sensor-tx-message'); //                      0x2e
const SensorRxMessage = require('./messages/sensor-rx-message'); //                      0x2f
// Added support for g6 if serial number starts with 8xxxxx
const GlucoseTxMessage = require('./messages/glucose-tx-message'); //              0x30, 0x4e
const GlucoseRxMessage = require('./messages/glucose-rx-message'); //              0x31, 0x4f

const CalibrationDataTxMessage = require('./messages/calibration-data-tx-message'); //   0x32
const CalibrationDataRxMessage = require('./messages/calibration-data-rx-message'); //   0x32
const CalibrateGlucoseTxMessage = require('./messages/calibrate-glucose-tx-message'); // 0x34
const CalibrateGlucoseRxMessage = require('./messages/calibrate-glucose-rx-message'); // 0x35
const ResetTxMessage = require('./messages/transmitter-reset-tx-message'); //            0x42
const ResetRxMessage = require('./messages/transmitter-reset-rx-message'); //            0x43
const AnubisTxResetDefaultMessage = require('./messages/anubis-tx-reset-default-message'); // 0xf080
const AnubisTxResetExtendedMessage = require('./messages/anubis-tx-reset-extended-message'); // 0xf080
const AnubisTxStatusMessage = require('./messages/anubis-tx-status-message'); //      0x3b
const VersionRequestTxMessage = require('./messages/version-request-tx-message'); // 0x20, 0x4a, 0x52
const VersionRequestRx0Message = require('./messages/version-request-rx-0-message'); //  0x21
const VersionRequestRx1Message = require('./messages/version-request-rx-1-message'); //  0x4b
const VersionRequestRx2Message = require('./messages/version-request-rx-2-message'); //  0x53
const BackfillTxMessageG6 = require('./messages/backfill-tx-message-g6'); //                  0x50
const BackfillTxMessageG7 = require('./messages/backfill-tx-message-g7'); //                0x59
const BackfillRxMessage = require('./messages/backfill-rx-message'); //                  0x51
const BackfillControlRxMessage = require('./messages/backfill-control-rx-message'); //                  0x51
const D0UnknownRxMessage = require('./messages/d0-unknown-rx-message');

const Glucose = require('./glucose');
const { CGMServiceCharacteristic: uuid } = require('./bluetooth-services');

const CallbackNotifier = require('./callback-notifier');

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
    this.savedMacAddress = macAddress?.toUpperCase();
    this.g7Transmitter = false;

    if (Transmitter.g7TxId(this.id)) {
      this.plugin = Plugin.getInstance(id); // tx ID is the password for the keks plugin

      this.plugin.setPersistence(2, sensorKey);
      if (this.alternateBluetoothChannel) {
        // tell the plugin to use the alternate BT channel
        this.plugin.setPersistence(6, Buffer.from([0x2]));
      }

      this.g7Transmitter = true;
    }

    // if serial number starts with 8xxxxx then assume g6
    this.g6Transmitter = !this.g7Transmitter;
    const g6Type = id.substr(0, 2);
    this.g6PlusTransmitter = (
      g6Type === '8G' || g6Type === '8H' || g6Type === '8J' || g6Type === '8L' || g6Type === '8R');

    if (this.maxRuntimeDays > 120) {
      this.g6AnubisTransmitter = true;
    }

    this.manager = new BluetoothManager(this, this.savedMacAddress);

    try {
      this.manager.initializeBluetooth();

      this.manager.unpairDevice();
    } catch (err) {
      debug(`Failed to initialize Bluetooth: ${err}`);
    }
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
          await this.manager.writeValueNoWait(bytesToSend, uuid.ExtraData, 10);
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

  async authenticateAndPairG7() {
    let authenticated = false;

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

    let bonded = false;

    /* eslint-disable no-await-in-loop -- Authentication is a sequential state machine */
    while (!bonded) {
      const data = await this.manager.readValueAndWait(uuid.Authentication, null, 10);

      const bondNow = Plugin.bondNow(data);

      if (bondNow && !bonded) {
        const key = this.plugin.getSharedKey();

        if (key) {
          authenticated = true;
        }

        debug('Creating bond!');
        bonded = await this.requestBond();
        debug('Creating bond complete!');
      }

      if (data[0] === BondRequestRxMessage.opcode) {
        debug('Transmitter says bond complete!');
        bonded = true;
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
    /* eslint-enable no-await-in-loop */

    await this.enableNotify(false);

    return authenticated;
  }

  async requestBond() {
    if (this.g6Transmitter) {
      try {
        await this.manager.writeValueAndWait(new KeepAliveTxMessage(60).data, uuid.Authentication);
      } catch (error) {
        throw new Error(`Error writing keep-alive for bond: ${error}`);
      }
    }

    try {
      const respMsg = await this.manager.writeValueAndWait(
        new BondRequestTxMessage().data,
        uuid.Authentication,
      );

      debug(`requested bond: ${respMsg ? respMsg[0] : ''}`);
    } catch (error) {
      throw new Error(`Error writing bond request: ${error}`);
    }
  }

  async authenticateAndPairG6() {
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

    if (status.bonded !== 0x1) {
      debug('Creating bond!');
      await this.requestBond();
      debug('Creating bond complete!');
    }

    await this.enableNotify(status.bonded !== 0x1);

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
    let gotVersionMsg = false;
    let txMessage = new VersionRequestTxMessage(0);
    let data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

    this.firmwareData = { };

    try {
      const rxMessage = new VersionRequestRx0Message(data);
      this.firmwareData.status = rxMessage.status;
      this.firmwareData.firmwareVersion = rxMessage.firmwareVersion;
      this.firmwareData.btFirmwareVersion = rxMessage.btFirmwareVersion;
      this.firmwareData.hardwareRev = rxMessage.hardwareRev;
      this.firmwareData.otherFirmwareVersion = rxMessage.otherFirmwareVersion;
      this.firmwareData.asic = rxMessage.asic;

      gotVersionMsg = true;
    } catch (error) {
      debug(`return for version tx type 0 messages invalid: ${error}`);
    }

    txMessage = new VersionRequestTxMessage(1);
    data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

    try {
      const rxMessage = new VersionRequestRx1Message(data);
      this.firmwareData.status = rxMessage.status;
      this.firmwareData.firmwareVersion = rxMessage.firmwareVersion;
      this.firmwareData.buildVersion = rxMessage.buildVersion;
      this.firmwareData.inactiveDays = rxMessage.inactiveDays;
      this.firmwareData.maxRuntimeDays = rxMessage.maxRuntimeDays;
      this.firmwareData.maxInactiveDays = rxMessage.maxInactiveDays;

      gotVersionMsg = true;
    } catch (error) {
      debug(`return for version tx type 1 messages invalid: ${error}`);
    }

    txMessage = new VersionRequestTxMessage(2);
    data = await this.manager.writeValueAndWaitForNotification(txMessage.data, uuid.Control);

    try {
      const rxMessage = new VersionRequestRx2Message(data);
      this.firmwareData.status = rxMessage.status;
      this.firmwareData.typicalSensorDays = rxMessage.typicalSensorDays;
      this.firmwareData.featureBits = rxMessage.featureBits;

      gotVersionMsg = true;
    } catch (error) {
      debug(`return for version tx type 2 messages invalid: ${error}`);
    }

    if (gotVersionMsg) {
      debug(`got version messages: ${this.firmwareData.firmwareVersion}`);

      this.emit('version', this.firmwareData);

      debug(`emitting versionData messageProcessed: ${this.getVersionDate}`);
      this.emit('messageProcessed', { time: this.getVersionDate });
    } else {
      debug('unable to get version');
    }

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
      if (!this.g7Transmitter) {
        backfillMessage = new BackfillTxMessageG6(this.backfill_start, this.backfill_end);
        this.parser = new BackfillParserG6(this.activationDate);
      } else {
        backfillMessage = new BackfillTxMessageG7(this.backfill_start, this.backfill_end);
        this.parser = new BackfillParserG7(this.activationDate);
      }

      // setup callback notifications on the Backfill characteristing.
      await this.manager.setupNotification(uuid.Backfill, (data) => this.parser.push(data));
      // enable notify on the Backfill characteristic
      await this.manager.setNotifyEnabledAndWait(true, uuid.Backfill);

      const notifier = new CallbackNotifier();
      await this.manager.setupNotification(uuid.Control, notifier.notify);

      // Send the BackfillTxMessage and receive a BackfillRxMesssage.
      // This should start trigerring callbacks on notification setup above.
      debug(`Sending BackfillTxMessage ${backfillMessage.data.toString('hex')}`);
      await this.manager.writeValueAndWait(
        backfillMessage.data,
        uuid.Control,
      );

      let backfillDone = false;
      while (!backfillDone) {
        // eslint-disable-next-line no-await-in-loop
        const data = await notifier.next();

        if (data[0] === BackfillRxMessage.opcode) {
          const msg = new BackfillRxMessage(data);
          debug(`BackfillRxMessage: ${JSON.stringify(msg)}`);
          this.parser.setBackfillRxMessage(msg);
          backfillDone = true;
        } else if (data[0] === BackfillControlRxMessage.opcode) {
          debug(`BackfillControlRxMessage: ${data.toString('hex')}`);
          const controlMessage = new BackfillControlRxMessage(data);

          debug(`Backfill sent from ${controlMessage.backfill_start} to ${controlMessage.backfill_end}`);
          if (this.g7Transmitter) {
            backfillDone = true;
          }
        } else {
          debug(`unexpected msg: ${data.toString('hex')}`);
        }
      }

      return;
    }

    debug('no backfill needed');
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
    let messageType;

    switch (command.type) {
      case 'StartSensor': {
        messageType = 'StartSensor';
        const startTime = (command.date - activationDate) / 1000;
        txMessage = new SessionStartTxMessage(startTime, command.sensorSerialCode);
        break;
      }
      case 'StopSensor': {
        messageType = 'StopSensor';
        const stopTime = (command.date - activationDate) / 1000;
        txMessage = new SessionStopTxMessage(stopTime);
        break;
      }
      case 'CalibrateSensor': {
        messageType = 'CalibrateSensor';
        const time = (command.date - activationDate) / 1000;
        txMessage = new CalibrateGlucoseTxMessage(command.glucose, time);
        break;
      }
      case 'ResetTx': {
        messageType = 'ResetTx';
        txMessage = new ResetTxMessage();
        break;
      }
      case 'ResetTxAnubisDefault': {
        messageType = 'ResetTxAnubisDefault';
        if (this.g6AnubisTransmitter) {
          txMessage = new AnubisTxResetDefaultMessage();
        }
        break;
      }
      case 'ResetTxAnubisExtended': {
        messageType = 'ResetTxAnubisExtended';
        if (this.g6AnubisTransmitter) {
          txMessage = new AnubisTxResetExtendedMessage();
        }
        break;
      }
      case 'StatusTxAnubis': {
        messageType = 'StatusTxAnubis';
        if (this.g6AnubisTransmitter) {
          txMessage = new AnubisTxStatusMessage();
        }
        break;
      }
      case 'BatteryStatus': {
        messageType = 'BatteryStatus';
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
      debug('got message: ', rxMessage);
    }
    debug(`emitting messageProcessed for ${messageType} sent with command date = ${command.date}`);
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
      return new CalibrationDataRxMessage(data);
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

  shouldConnect(name, addr, rssi) {
    // TODO: if we have a MAC address from a transmitter we have bound to,
    // we need to only connect to that MAC address until the id is changed
    // by the user.
    debug(`shouldConnect: ${name}`);

    if (!name) {
      return false;
    }

    if (this.g7Transmitter && (name.substr(0, 4) === 'DXCM')) {
      debug('shouldConnect: found G7');
      this.rssi = rssi;

      if (!this.savedMacAddress || (addr === this.savedMacAddress)) {
        debug(`shouldConnect: ${addr} === ${this.savedMacAddress}(saved) => connect!`);
        this.emit('sawTransmitter', { id: this.id, rssi, address: addr });
        return true;
      }

      debug(`shouldConnect: ${addr} !== ${this.savedMacAddress}(saved) => do not connect!`);
      return false;
    }

    if ((name.substr(0, 6) === 'Dexcom') && (name.substr(-2) === this.id.substr(-2))) {
      debug('shouldConnect: found matching G6');

      this.rssi = rssi;
      this.address = addr;
      this.emit('sawTransmitter', { id: this.id, rssi, address: addr });
      return true;
    }

    return false;
  }

  async isReady(macAddress) {
    try {
      debug(`Authenticating with transmitter, alternate bt channel: ${this.alternateBluetoothChannel}`);
      if (!this.g7Transmitter) {
        await this.authenticateAndPairG6();
        // If we got here with G6, we already verified we found the right transmitter
        // because of the name. G7 names are random, so the only way to know if we found
        // the right one is authentication success.
        this.manager.keepScanning = false;
      } else {
        if (macAddress !== this.savedMacAddress) {
          debug(`isReady: ${macAddress} !== ${this.savedMacAddress}(saved) => negotiate a new key`);
          // this doesn't match the MAC address
          // we saved for the key. Need to start over
          // and negotiate a key with this sensor
          this.plugin.setPersistence(2, null);
        } else {
          debug(`isReady: ${macAddress} === ${this.savedMacAddress}(saved) => reusing shared key`);
        }

        await this.authenticateAndPairG7();

        const key = this.plugin.getSharedKey();

        if (key) {
          // set the shared key and mac address
          // to the application so they can be stored
          this.savedMacAddress = macAddress;
          this.emit('sensorKey', { id: this.id, key: key.toString('hex'), address: macAddress });

          // let BluetoothManager know that we succeeded
          this.manager.keepScanning = false;
        } else {
          // otherwise, clear it all
          this.emit('sensorKey', { id: this.id, key: '', address: '' });
        }
      }

      debug('Reading glucose');
      let glucoseMessage = null;
      glucoseMessage = await this.readGlucose();
      debug(`Received glucose: ${JSON.stringify(glucoseMessage)}`);

      let activationDate;
      let sessionStartDate;
      let timeMessage = null;

      if (!this.g7Transmitter) {
        debug('Reading time');
        timeMessage = await this.readTimeMessage();

        activationDate = new Date(Date.now() - timeMessage.currentTime * 1000);
        this.activationDate = activationDate;
        debug(`Determined activation date: ${activationDate}`);

        sessionStartDate = (timeMessage.sessionStartTime < 0xffffffff)
          ? new Date(activationDate + timeMessage.sessionStartTime * 1000) : null;
        debug(`Determined session start date: ${sessionStartDate}`);
      } else {
        activationDate = new Date(
          Date.now() - glucoseMessage.timestamp * 1000 - glucoseMessage.age * 1000,
        );
        this.activationDate = activationDate;
        debug(`Determined activation date: ${activationDate}`);

        sessionStartDate = activationDate;
        debug(`Determined session start date: ${sessionStartDate}`);
      }

      // const syncDate = Date.now();
      const messages = await this.getMessages();

      /* eslint-disable no-await-in-loop -- serial messaging with the transmitter */
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
        } else if ((message.type === 'StopSensor') && !this.g6Transmitter) {
          debug(`Ignoring Stop Sensor for devices newer than G6: ${message.type}`);
        } else {
          debug(`Sending command: ${message.type}`);

          try {
            await this.sendCommand(message, activationDate);
          } catch (error) {
            debug(`Error sending command: ${message.type}`);
            debug(error);
            debug(`Sending command: ${message.type}`);
            try {
              await this.sendCommand(message, activationDate);
            } catch (error2) {
              // Even though there was an error, we want to continue on
            }
          }

          if ((message.type === 'StartSensor') || (message.type === 'StopSensor')) {
            debug(`Reading glucose again after ${message.type}`);
            glucoseMessage = await this.readGlucose();
            debug(`Received glucose: ${JSON.stringify(glucoseMessage)}`);
          }
        }
      }
      /* eslint-enable no-await-in-loop -- serial messaging with the transmitter */

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

      let sensorMessage = null;

      try {
        if (!this.g7Transmitter) {
          debug('Reading sensor message');
          sensorMessage = await this.readSensorMessage();
        }

        if (this.backfill && this.parser) {
          if (this.parser.validate()) {
            debug('Parsing backfill data');
            const backfillData = this.parser.parse();
            debug(`got backfill data: ${JSON.stringify(backfillData)}`);
            this.emit('backfillData', backfillData);
          } else {
            debug('ERROR - BackfillParser in an invalid state.');
          }
          debug(`emitting backfill messageProcessed: ${this.backfill_date}`);
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
          debug(`emitting glucose ${JSON.stringify(glucose)}`);
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

  async didDisconnect() {
    await sleep(2000); // sleep 2 seconds before allow process to be killed

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
