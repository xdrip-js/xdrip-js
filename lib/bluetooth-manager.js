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
  noble.on('disconnect', this.didDisconnect.bind(this));
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

  peripheral.on('connect', function() {
    debug('on -> connect');
    this.discoverServices([UUID.TransmitterService.CGMService]);
    // this.discoverServices();
  });

  peripheral.on('disconnect', function() {
    debug('on -> disconnect');
  });

  peripheral.on('servicesDiscover', function(services) {
    debug('on -> peripheral services discovered ' + services);
    services.forEach(function(service) {
      // service.on('includedServicesDiscover', function(includedServiceUuids) {
      //   console.log('on -> service included services discovered ' + includedServiceUuids);
        service.discoverCharacteristics();
      // });
      service.on('characteristicsDiscover', function(characteristics) {
        console.log('on -> service characteristics discovered ' + characteristics);
        for (let characteristic of characteristics) {
          debug('on -> characteristic discovered: ' + characteristic);
          const uuid = characteristic.uuid;
          if (undiscoveredUUIDs.has(uuid)) {
            characteristicsMap.set(uuid, characteristic);
            undiscoveredUUIDs.delete(uuid);
          }
        }
        if (undiscoveredUUIDs.size === 0) {
          _delegate.isReady();
          // break;
        }
      });
      service.discoverIncludedServices();
    });
  });

  peripheral.connect();
};

BluetoothManager.prototype.didDisconnect = function(peripheral) {
  debug('disconnected peripheral ' + peripheral);
  setTimeout(scanForPeripheral, 60000);
  _delegate.didDisconnect();
};


BluetoothManager.prototype.writeValueAndWait = function(value, uuid, timeout = 60000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.write(value, false, function() {
      debug('Tx ' + value.toString(16));
      resolve();
    });
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.readValueAndWait = function(uuid, firstByte, timeout = 60000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.read(function(error, data) {
      debug('Rx ' + data.toString(16));
      if (data) {
        if ((!firstByte) || (data[0] === firstByte)) {
          resolve(data);
        } else {
          reject('received ' + data.toString(16) + ', expecting ' + firstByte.toString(16));
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

BluetoothManager.prototype.setNotifyEnabledAndWait = function(enabled, uuid, timeout = 60000) {
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

BluetoothManager.prototype.waitForNotification = function(uuid, firstByte, timeout = 60000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.once('data', data => {
      debug('Rx ' + data.toString(16));
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

BluetoothManager.prototype.writeValueAndWaitForNotification = function(value, uuid, firstByte, timeout = 60000) {
  const characteristic = characteristicsMap.get(uuid);
  return new JealousPromise(function(resolve, reject) {
    characteristic.once('data', data => {
      debug('Rx ' + data.toString(16));
      if ((!firstByte) || (data[0] === firstByte)) {
        resolve(data);
      } else {
        reject('received ' + data[0].toString(16) + ', expecting ' + firstByte.toString(16));
      }
    });
    characteristic.write(value, false);
    debug('Tx ' + value.toString(16));
    setTimeout(() => {
      reject('timeout');
    }, timeout);
  });
};

BluetoothManager.prototype.wait = function(t) {
  return new Promise(function(resolve) {
    setTimeout(resolve, t);
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
