/* eslint max-classes-per-file: "off" */

const noble = require('@abandonware/noble');
const debug = require('debug')('bluetooth-manager');

const { jealousPromise } = require('./jealous-promise');
const UUID = require('./bluetooth-services');

const UUIDToName = Object.fromEntries(
  Object.entries(UUID.CGMServiceCharacteristic).map(([name, uuid]) => [uuid, name]),
);

function scanForPeripheral() {
  const serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  noble.startScanning(serviceUUIDs, true);
}

module.exports = class BluetoothManager {
  constructor(delegate) {
    this.characteristicsMap = new Map();
    this.delegate = delegate;
    this.peripheral = null;
    this.discoverSuccess = false;
    this.discoverFailures = 0;
    this.lastDiscoveredAddress = null;
    this.lastDiscoveredTime = 0;
    this.isConnecting = false;
    noble.on('stateChange', this.onStateChange.bind(this));
    noble.on('discover', this.didDiscover.bind(this));
    noble.on('scanStart', () => debug('on -> scanStart'));
    noble.on('scanStop', () => debug('on -> scanStop'));
  }

  onStateChange(state) {
    debug(`on -> stateChange: ${state}`);

    if (state === 'poweredOn') {
      debug('starting scanning');
      this.discoverFailures = 0;
      scanForPeripheral();
    } else {
      debug('stopping scanning');
      noble.stopScanning();
    }
  }

  didDiscover(peripheral, retry = false) {
    const addr = peripheral.address || peripheral.id;
    debug(`${Date()}: Found peripheral: ${peripheral.advertisement.localName} | RSSI: ${peripheral.rssi} | State: ${peripheral.state} | retry=${retry} | addr=${addr}`);

    if (this.lastDiscoveredAddress === addr
      && Date.now() - this.lastDiscoveredTime < 3000 && !retry) {
      debug(`→ Ignoring duplicate discovery for ${addr}`);
      return;
    }

    this.lastDiscoveredAddress = addr;
    this.lastDiscoveredTime = Date.now();

    if (!this.delegate.shouldConnect(peripheral)) {
      debug('→ shouldConnect() returned false - skipping');
      return;
    }

    if (peripheral.state !== 'disconnected') {
      debug(`→ Skipping: current state is "${peripheral.state}"`);
      if (['connecting', 'disconnecting'].includes(peripheral.state)) {
        debug('→ Forcing disconnect from stuck state');
        peripheral.disconnect();
      }
      return;
    }

    if (this.isConnecting) {
      debug('→ Already attempting connection - skipping');
      return;
    }

    this.isConnecting = true;
    this.peripheral = peripheral;
    this.discoverSuccess = false;

    const attemptConnect = () => {
      debug(`${Date()}: Attempting to connect to ${peripheral.advertisement.localName} (RSSI ${peripheral.rssi})...`);

      const connectStartTime = Date.now();

      const connectOptions = {
        connectionInterval: 40,
        connectionLatency: 0,
        supervisionTimeout: 5000,
      };

      const connectTimeout = setTimeout(() => {
        const elapsed = Date.now() - connectStartTime;
        debug(`⚠️ CONNECT TIMEOUT after ${elapsed}ms`);
        peripheral.disconnect();
      }, 15000);

      peripheral.once('connect', () => {
        clearTimeout(connectTimeout);
        debug(`→ SUCCESS: Connected after ${Date.now() - connectStartTime}ms`);
        this.discoverSuccess = true;
        this.isConnecting = false;

        peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
        peripheral.discoverServices([UUID.TransmitterService.CGMService]);
      });

      peripheral.once('disconnect', (reason) => {
        clearTimeout(connectTimeout);
        debug(`→ DISCONNECTED after ${Date.now() - connectStartTime}ms: ${reason || 'unknown'}`);
        this.peripheral = null;
        this.isConnecting = false;
        peripheral.removeAllListeners();

        if (!this.discoverSuccess && this.discoverFailures < 30) {
          this.discoverFailures += 1;
          setTimeout(() => this.didDiscover(peripheral, true), 2500);
        } else {
          setTimeout(scanForPeripheral, 60000);
          this.delegate.didDisconnect();
        }
      });

      // Error handler
      const onError = (err) => {
        clearTimeout(connectTimeout);
        debug(`→ CONNECT ERROR: ${err.message || err}`);
        this.isConnecting = false;
        peripheral.removeListener('error', onError); // clean up
      };

      peripheral.once('error', onError);

      peripheral.connect(connectOptions);
    };

    if (!retry) {
      debug('→ Stopping scanning...');

      const onScanStop = () => {
        debug('→ scanStop received - starting connect');
        attemptConnect();
      };

      noble.once('scanStop', onScanStop);

      const stopTimeout = setTimeout(() => {
        debug('⚠️ scanStop timeout - proceeding');
        noble.removeListener('scanStop', onScanStop);
        attemptConnect();
      }, 2000);

      noble.stopScanning();
      noble.once('scanStop', () => clearTimeout(stopTimeout));
    } else {
      attemptConnect();
    }
  }

  didDiscoverServices(services) {
    debug('on -> peripheral services discovered');

    // we only searched for one service; assume we only got one
    const service = services[0];
    if (service.uuid !== UUID.TransmitterService.CGMService) {
      debug(`unexpected peripheral service discovered: ${service.uuid}`);
      return;
    }

    this.discoverSuccess = true;

    service.once('characteristicsDiscover', this.didDiscoverCharacteristics.bind(this));
    service.discoverCharacteristics();
  }

  didDiscoverCharacteristics(characteristics) {
    debug('on -> service characteristics discovered');
    const undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic)
      .map((k) => UUID.CGMServiceCharacteristic[k]));
    characteristics.forEach((characteristic) => {
      const { uuid } = characteristic;
      if (undiscoveredUUIDs.has(uuid)) {
        this.characteristicsMap.set(uuid, characteristic);
        undiscoveredUUIDs.delete(uuid);
      }
    });
    if (undiscoveredUUIDs.size === 0) {
      this.delegate.isReady(this.peripheral.address);
    } else if (this.delegate.g7Transmitter
      && (undiscoveredUUIDs.size === 1)
      && undiscoveredUUIDs.has(UUID.CGMServiceCharacteristic.Communication)) {
      this.delegate.isReady(this.peripheral.address);
    } else {
      const remaining = [...undiscoveredUUIDs].map((uuid) => ({
        name: UUIDToName[uuid] || 'Unknown',
        uuid,
      }));

      debug(`Remaining: ${remaining.map((r) => `${r.name}(${r.uuid})`).join(', ')}`);
    }
  }

  writeValueAndWait(value, uuid, timeout = 5000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    if (!characteristic) {
      return Promise.reject(new Error(`Characteristic ${uuid} not found`));
    }

    return jealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.write(value, false, (err) => {
        if (err) {
          reject(err);
        } else {
          debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
          resolve();
        }
      }, 'writeValueAndWait');

      // Timeout protection
      setTimeout(() => {
        reject(new Error(`Write timeout for ${name}(${uuid})`));
      }, timeout);
    }, `writeValueAndWait to ${name}(${uuid})`);
  }

  readValueAndWait(uuid, firstByte, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    return jealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.read((error, data) => {
        if (data) {
          debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);
          if ((!firstByte) || (data[0] === firstByte)) {
            resolve(data);
          } else {
            reject(`received ${data.toString('hex')}, expecting ${firstByte.toString(16)}`);
          }
        } else {
          reject(error);
        }
      });
      setTimeout(() => {
        reject('timeout');
      }, timeout);
    }, `readValueAndWait from ${name}(${uuid})`);
  }

  setNotifyEnabledAndWait(enabled, uuid, timeout = 3000) {
    const name = UUIDToName[uuid] || 'Unknown UUID';
    debug(`setting notify to ${enabled} for ${name}(${uuid}) to ${enabled}`);

    const characteristic = this.characteristicsMap.get(uuid);
    return jealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.notify(true, (error) => {
        if (error) {
          reject(error);
        } else {
          debug(`successfully set notify enabled for ${name}(${uuid}) to ${enabled}`);
          resolve();
        }
      });
      setTimeout(() => {
        reject('timeout');
      }, timeout);
    }, `setNotifyEnabledAndWait on ${name}(${uuid})`);
  }

  setupNotification(uuid, callback) {
    const characteristic = this.characteristicsMap.get(uuid);
    characteristic.subscribe();
    characteristic.on('data', callback);
  }

  waitForNotification(uuid, firstByte, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    return jealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.once('data', (data) => {
        debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);
        if ((!firstByte) || (data[0] === firstByte)) {
          resolve(data);
        } else {
          reject(`received ${data[0].toString(16)}, expecting ${firstByte.toString(16)}`);
        }
      });
      setTimeout(() => {
        reject('timeout');
      }, timeout);
    }, `waitForNotification on ${name}(${uuid})`);
  }

  writeValueAndWaitForNotification(value, uuid, firstByte, timeout = 3000) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    return jealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.once('data', (data) => {
        debug(`Rx ${data.toString('hex')} from ${name}(${uuid})`);
        if ((!firstByte) || (data[0] === firstByte)) {
          resolve(data);
        } else {
          reject(`received ${data[0].toString(16)}, expecting ${firstByte.toString(16)}`);
        }
      });
      characteristic.write(value, false);
      debug(`Tx ${value.toString('hex')}`);
      setTimeout(() => {
        reject('timeout');
      }, timeout);
    }, `writeValueAndWaitForNotification to ${name}(${uuid})`);
  }

  writeValueNoWait(value, uuid) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    characteristic.write(value, true);
    debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
  }

  wait(t) {
    return jealousPromise(this.peripheral, (resolve) => setTimeout(resolve, t), 'wait');
  }
};
