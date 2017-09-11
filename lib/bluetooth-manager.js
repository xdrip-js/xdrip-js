const noble = require('noble');
const debug = require('debug')('bluetooth-manager');

const UUID = require('./bluetooth-services');

const characteristicsMap = new Map();
let _delegate;

function BluetoothManager(delegate) {
  _delegate = delegate;
  noble.on('stateChange', this.onStateChange.bind(this));
  noble.on('discover', this.didDiscover.bind(this));
  noble.on('scanStart', () => debug('on -> scanStart'));
  noble.on('scanStop', () => debug('on -> scanStop'));
}

BluetoothManager.prototype.onStateChange = function(state) {
  debug('on -> stateChange: ' + state);

  if (state === 'poweredOn') {
    debug('starting scanning');
    this.scanForPeripheral();
  } else {
    debug('stopping scanning');
    noble.stopScanning();
  }
};

BluetoothManager.prototype.scanForPeripheral = function() {
  const serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  noble.startScanning(serviceUUIDs, false);
};

BluetoothManager.prototype.didDiscover = function(peripheral) {
  debug(Date() + ': peripheral: ' + peripheral.advertisement.localName + ' with rssi ' + peripheral.rssi);
  if (!_delegate.shouldConnect(peripheral)) return;
  noble.stopScanning();
  peripheral.once('connect', () => {
    debug('on -> connect');
    peripheral.once('servicesDiscover', this.didDiscoverServices.bind(this));
    peripheral.discoverServices([UUID.TransmitterService.CGMService]);
  });
  peripheral.once('disconnect', () => {
    debug('disconnected peripheral');
    setTimeout(this.scanForPeripheral.bind(this), 60000); // TODO: consider scanning again 4.5 minutes after last connect (could save power?)
    _delegate.didDisconnect();
  });
  peripheral.connect();
};

BluetoothManager.prototype.didDiscoverServices = function(services) {
  debug('on -> peripheral services discovered');
  // we only searched for one service; assume we only got one
  service = services[0];
  if (service.uuid !== UUID.TransmitterService.CGMService) return;
  service.once('characteristicsDiscover', this.didDiscoverCharacteristics.bind(this));
  service.discoverCharacteristics();
};

BluetoothManager.prototype.didDiscoverCharacteristics = function(characteristics) {
  debug('on -> service characteristics discovered');
  const undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic).map(k => UUID.CGMServiceCharacteristic[k]));
  for (let characteristic of characteristics) {
    const uuid = characteristic.uuid;
    if (undiscoveredUUIDs.has(uuid)) {
      characteristicsMap.set(uuid, characteristic);
      undiscoveredUUIDs.delete(uuid);
    }
  }
  if (undiscoveredUUIDs.size === 0) {
    _delegate.isReady();
  }
};

BluetoothManager.prototype.writeValueAndWait = function(value, uuid, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.write(value, false, function() {
      debug('Tx ' + value.toString('hex'));
      resolve();
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.readValueAndWait = function(uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.read(function(error, data) {
      debug('Rx ' + data.toString('hex'));
      if (data) {
        if ((!firstByte) || (data[0] === firstByte)) {
          resolve(data);
        } else {
          reject('received ' + data.toString('hex') + ', expecting ' + firstByte.toString(16));
        }
      }
      else {
        reject(error);
      }
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.setNotifyEnabledAndWait = function(enabled, uuid, timeout = 2000) {
  debug('setting notify to ' + enabled);
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.notify(true, function(error) {
      if (error) {
        reject(error);
      }
      else {
        debug('successfully set notify enabled for ' + uuid + ' to ' + enabled);
        resolve();
      }
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.waitForNotification = function(uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.once('data', data => {
      debug('Rx ' + data.toString('hex'));
      if ((!firstByte) || (data[0] === firstByte)) {
        resolve(data);
      } else {
        reject('received ' + data[0].toString(16) + ', expecting ' + firstByte.toString(16));
      }
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.writeValueAndWaitForNotification = function(value, uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.once('data', data => {
      debug('Rx ' + data.toString('hex'));
      if ((!firstByte) || (data[0] === firstByte)) {
        resolve(data);
      } else {
        reject('received ' + data[0].toString(16) + ', expecting ' + firstByte.toString(16));
      }
    });
    characteristic.write(value, false);
    debug('Tx ' + value.toString('hex'));
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.wait = function(t) {
  return new JealousPromise(resolve => setTimeout(resolve, t));
};

let outstandingPromise = null;

// A simple class that extends Promise to allow one outstanding promise only
// The constructor will throw if we are already awaiting the result of a
// bluetooth operation
class JealousPromise {
  constructor (executor) {
    if (outstandingPromise) {
      throw new Error('bluetooth busy');
    }
    outstandingPromise = new Promise(executor);
    return outstandingPromise.then(
      value => {outstandingPromise = null; return value;},
      reason => {outstandingPromise = null;throw reason;}
    );
  }
}

module.exports = BluetoothManager;
