/* eslint max-classes-per-file: "off" */

const noble = require('@abandonware/noble');
const debug = require('debug')('bluetooth-manager');

const UUID = require('./bluetooth-services');

const UUIDToName = Object.fromEntries(
  Object.entries(UUID.CGMServiceCharacteristic).map(([name, uuid]) => [uuid, name])
);

// NOTE: this probably assumes a singleton pattern;
let outstandingPromise = null;
let currentOperation = null;

function jealousPromise(peripheral, executor, operationName = "unknown operation") {
  if (outstandingPromise) {
    const msg = currentOperation 
      ? `${currentOperation.name} (created ${new Date(currentOperation.timestamp).toISOString()})`
      : "unknown operation";

    const error = new Error(`Bluetooth busy - previous operation still pending: ${msg}`);
    error.name = "BluetoothBusyError";

    debug(`=== Bluetooth Busy Error ===`);
    debug(error.message);
    
    if (currentOperation && currentOperation.stack) {
      debug("Original operation was started here:");
      debug(currentOperation.stack.split('\n').slice(0, 8).join('\n')); // first 8 lines
    }

    throw error;
  }

  const creationStack = new Error(`jealousPromise created for: ${operationName}`).stack;

  let disconnectHandler;

  outstandingPromise = new Promise((resolve, reject) => {
    currentOperation = {
      name: operationName,
      stack: creationStack,
      timestamp: Date.now()
    };

    disconnectHandler = () => {
      reject(new Error(`Transmitter disconnected during: ${operationName}`));
    };

    peripheral.once('disconnect', disconnectHandler);

    try {
      executor(resolve, reject);
    } catch (err) {
      reject(err);
    }
  });

  return outstandingPromise.then(
    (value) => {
      outstandingPromise = null;
      currentOperation = null;
      peripheral.removeListener('disconnect', disconnectHandler);
      return value;
    },
    (reason) => {
      outstandingPromise = null;
      currentOperation = null;
      peripheral.removeListener('disconnect', disconnectHandler);
      throw reason;
    }
  );
}

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

  didDiscover(peripheral) {
    debug(`${Date()}: peripheral: ${peripheral.advertisement.localName} with rssi ${peripheral.rssi}`);

    if (!this.delegate.shouldConnect(peripheral) || (peripheral.state !== 'disconnected')) return;

    this.peripheral = peripheral;

    noble.stopScanning();
    peripheral.once('connect', async () => {
      debug('on -> connect');
      this.discoverSuccess = false;

      peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
      peripheral.discoverServices([UUID.TransmitterService.CGMService]);
    });
    peripheral.once('disconnect', () => {
      debug('disconnected peripheral');
      this.peripheral = null;
      peripheral.removeAllListeners();

      if (!this.discoverSuccess && (this.discoverFailures < 25)) {
        this.discoverFailures += 1;

        debug(`trying to reconnect... ${this.discoverFailures}`);

        this.didDiscover(peripheral);
      } else {
        debug('scanning again in 1 minute');
        // TODO: consider scanning again 4.5 minutes after last connect (could save power?)
        setTimeout(scanForPeripheral, 60000);
        this.delegate.didDisconnect();
      }
    });

    debug(`${Date()}: peripheral: attempting to connect to ${peripheral.advertisement.localName}`);

    peripheral.connect();
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
    } else if (this.delegate.g7Transmitter && (undiscoveredUUIDs.size === 1) && undiscoveredUUIDs.has(UUID.CGMServiceCharacteristic.Communication)) {
      this.delegate.isReady(this.peripheral.address);
    } else {
      const remaining = [...undiscoveredUUIDs].map(uuid => ({
        name: UUIDToName[uuid] || 'Unknown',
        uuid: uuid
      }));

      debug(`Remaining: ${remaining.map(r => `${r.name}(${r.uuid})`).join(', ')}`);
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
      });

      // Timeout protection
      setTimeout(() => {
        reject(new Error(`Write timeout for ${name}(${uuid})`));
      }, timeout);
    }, `Write to ${name}(${uuid})`);
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
    });
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
    });
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
    });
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
    });
  }

  writeValueNoWait(value, uuid) {
    const characteristic = this.characteristicsMap.get(uuid);
    const name = UUIDToName[uuid] || 'Unknown UUID';

    characteristic.write(value, true);
    debug(`Tx ${value.toString('hex')} to ${name}(${uuid})`);
  }

  wait(t) {
    return jealousPromise(this.peripheral, (resolve) => setTimeout(resolve, t));
  }
};
