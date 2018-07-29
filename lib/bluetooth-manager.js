const noble = require('noble');
const debug = require('debug')('bluetooth-manager');

const UUID = require('./bluetooth-services');

// NOTE: this probably assumes a singleton pattern;
let outstandingPromise = null;

// A simple class that extends Promise to allow one outstanding promise only
// The constructor will throw if we are already awaiting the result of a
// bluetooth operation
class JealousPromise {
  constructor(peripheral, executor) {
    if (outstandingPromise) {
      throw new Error('bluetooth busy');
    }
    let disconnectHandler;
    outstandingPromise = new Promise((resolve, reject) => {
      disconnectHandler = () => {
        reject(new Error('transmitter disconnected'));
      };
      peripheral.once('disconnect', disconnectHandler);
      executor(resolve, reject);
    });
    return outstandingPromise.then(
      (value) => {
        outstandingPromise = null;
        peripheral.removeListener('disconnect', disconnectHandler);
        return value;
      },
      (reason) => {
        outstandingPromise = null;
        peripheral.removeListener('disconnect', disconnectHandler);
        throw reason;
      },
    );
  }
}

function scanForPeripheral() {
  const serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  noble.startScanning(serviceUUIDs, false);
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
    this.peripheral = peripheral;
    if (!this.delegate.shouldConnect(peripheral)) return;
    noble.stopScanning();
    peripheral.once('connect', () => {
      debug('on -> connect');
      this.discoverSuccess = false;
      peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
      peripheral.discoverServices([UUID.TransmitterService.CGMService]);
    });
    peripheral.once('disconnect', () => {
      debug('disconnected peripheral');
      this.peripheral = null;
      peripheral.removeAllListeners();

      if (!this.discoverSuccess && (this.discoverFailures < 3)) {
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
    peripheral.connect();
  }

  didDiscoverServices(services) {
    debug('on -> peripheral services discovered');
    // we only searched for one service; assume we only got one
    const service = services[0];
    if (service.uuid !== UUID.TransmitterService.CGMService) return;

    this.discoverSuccess = true;

    service.once('characteristicsDiscover', this.didDiscoverCharacteristics.bind(this));
    service.discoverCharacteristics();
  }

  didDiscoverCharacteristics(characteristics) {
    debug('on -> service characteristics discovered');
    const undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic)
      .map(k => UUID.CGMServiceCharacteristic[k]));
    characteristics.forEach((characteristic) => {
      const { uuid } = characteristic;
      if (undiscoveredUUIDs.has(uuid)) {
        this.characteristicsMap.set(uuid, characteristic);
        undiscoveredUUIDs.delete(uuid);
      }
    });
    if (undiscoveredUUIDs.size === 0) {
      this.delegate.isReady();
    }
  }

  writeValueAndWait(value, uuid, timeout = 10000) {
    const characteristic = this.characteristicsMap.get(uuid);
    return new JealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.write(value, false, () => {
        debug(`Tx ${value.toString('hex')}`);
        resolve();
      });
      setTimeout(() => {
        reject('timeout');
      }, timeout);
    });
  }

  readValueAndWait(uuid, firstByte, timeout = 10000) {
    const characteristic = this.characteristicsMap.get(uuid);
    return new JealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.read((error, data) => {
        if (data) {
          debug(`Rx ${data.toString('hex')}`);
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

  setNotifyEnabledAndWait(enabled, uuid, timeout = 10000) {
    debug(`setting notify to ${enabled}`);
    const characteristic = this.characteristicsMap.get(uuid);
    return new JealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.notify(true, (error) => {
        if (error) {
          reject(error);
        } else {
          debug(`successfully set notify enabled for ${uuid} to ${enabled}`);
          resolve();
        }
      });
      setTimeout(() => {
        reject('timeout');
      }, timeout);
    });
  }

  waitForNotification(uuid, firstByte, timeout = 10000) {
    const characteristic = this.characteristicsMap.get(uuid);
    return new JealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.once('data', (data) => {
        debug(`Rx ${data.toString('hex')}`);
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

  writeValueAndWaitForNotification(value, uuid, firstByte, timeout = 10000) {
    const characteristic = this.characteristicsMap.get(uuid);
    return new JealousPromise(this.peripheral, (resolve, reject) => {
      characteristic.once('data', (data) => {
        debug(`Rx ${data.toString('hex')}`);
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

  wait(t) {
    return new JealousPromise(this.peripheral, resolve => setTimeout(resolve, t));
  }
};
