const noble = require('noble');
const debug = require('debug')('bluetooth-manager');

const UUID = require('./bluetooth-services');

const characteristicsMap = new Map();
let _delegate;

// TODO: add function like 'scanAfterDelay, so that the app starts scanning again afer disconnecting'

function BluetoothManager(delegate) {
  _delegate = delegate;
  this.peripheral = null;
  noble.on('stateChange', this.onStateChange.bind(this));
  noble.on('discover', this.didDiscover.bind(this));
  noble.on('scanStart', function() {
    debug('on -> scanStart');
  });
  noble.on('scanStop', function() {
    debug('on -> scanStop');
  });
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

  this.peripheral = peripheral;

  const undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic).map(k => UUID.CGMServiceCharacteristic[k]));

  peripheral.connect(function(err) {
    if (err) debug(err);
    peripheral.discoverServices([UUID.TransmitterService.CGMService], function(err, services) {
      debug('on -> peripheral services discovered ' + services);
      if (err) debug(err);
      services.forEach(function(service) {
        service.discoverCharacteristics([], function(err, characteristics) {
          if (err) debug(err);
          for (let characteristic of characteristics) {
            const uuid = characteristic.uuid;
            if (undiscoveredUUIDs.has(uuid)) {
              characteristicsMap.set(uuid, characteristic);
              undiscoveredUUIDs.delete(uuid);
            }
            if (undiscoveredUUIDs.size === 0) {
              _delegate.isReady();
              break;
            }
          }
        });
      });
    });
  });
};

BluetoothManager.prototype.writeValueAndWait = function(value, uuid, timeout = 10000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.write(value, true, function() {
      resolve();
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.readValueAndWait = function(uuid, firstByte, timeout = 10000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.read(function(error, data) {
      if (data) {
        if ((!firstByte) || (data[0] === firstByte)) {
          resolve(data);
        } else {
          reject('received ' + data[0].toString('hex') + ', expecting ' + firstByte.toString('hex'));
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

BluetoothManager.prototype.setNotifyEnabledAndWait = function(enabled, uuid, timeout = 10000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.subscribe(function(error) {
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

BluetoothManager.prototype.waitForNotification = function(uuid, firstByte, timeout = 10000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.once('data', data => {
      if ((!firstByte) || (data[0] === firstByte)) {
        resolve(data);
      } else {
        reject('received ' + data[0].toString('hex') + ', expecting ' + firstByte.toString('hex'));
      }
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.writeValueAndWaitForNotification = function(value, uuid, firstByte, timeout = 10000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.once('data', data => {
      if ((!firstByte) || (data[0] === firstByte)) {
        resolve(data);
      } else {
        reject('received ' + data[0].toString('hex') + ', expecting ' + firstByte.toString('hex'));
      }
    });
    characteristic.write(value, true);
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
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
      reason => {outstandingPromise = null; throw reason;}
    );
  }
}

module.exports = BluetoothManager;
