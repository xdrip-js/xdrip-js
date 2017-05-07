const noble = require('noble');
//const events = require('events');
//const util = require('util');
const UUID = require('./bluetooth-services');
const debug = require('debug')('bluetooth-manager');


let outstandingPromise = null;

// const BluetoothOperationCondition = {
//   notificationStateUpdate: function(characteristic, enabled) {
//     this.toString = function() {return "op1:" + characteristic + ":" + enabled;};
//   },
//   valueUpdate: function(characteristic, firstByte) {
//     this.toString = function() {return "op2:" + characteristic + ":" + firstByte;};
//   },
//   writeUpdate: function(characteristic) {
//     this.toString = function() {return "op3:" + characteristic;};
//   }
// };
//
// const operationConditions = new Set();

const characteristicsMap = new Map();

// operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());
// operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", false).toString());
// operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());

let delegate;

// TODO: add function like 'scanAfterDelay, so that the app starts scanning again afer disconnecting'

function BluetoothManager(del) {
  delegate = del;
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

//util.inherits(BluetoothManager, events.EventEmitter);

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
  // we found a peripheral, stop scanning
//  console.log('on -> discover: ' + peripheral);
  debug(Date() + ': peripheral: ' + peripheral.advertisement.localName + ' with rssi ' + peripheral.rssi);
  if (!delegate.shouldConnect(peripheral)) return;
  noble.stopScanning();
  self = this;

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
          // const index = 0;
          // characteristics.forEach(function(characteristic) {
          for (let characteristic of characteristics) {
            const uuid = characteristic.uuid;
            if (undiscoveredUUIDs.has(uuid)) {
              characteristicsMap.set(uuid, characteristic);
              undiscoveredUUIDs.delete(uuid);
            }
            if (undiscoveredUUIDs.size === 0) {
              delegate.isReady();
              break;
            }
          }
        });
      });
    });
  });
};

function getCharacteristicWithUUID(uuid) {

}

BluetoothManager.prototype.readValueAndWait = function(uuid, firstByte, timeout = 2000) {
// //   if (!outstandingPromise && peripheral) {
  const characteristic = characteristicsMap.get(uuid);
  // console.log('in readValueAndWait, now have characteristic ' + characteristic);
  outstandingPromise = new Promise(function(resolve, reject) {

    // characteristic.on('data', function(data, isNotification) {
    //   console.log('data read');
    //   resolve(data);
    // });
    characteristic.read(function(error, data) {
      if (data) {
  // //           const conditon = new BluetoothOperationCondition.valueUpdate(uuid, data[0])
  // //           operationConditions.remove(condition)
  // //           if operationConditions.isEmpty() {
        resolve(data);
  // //             outstandingPromise = null;
  // //           }
      }
      else {
        reject(error);
  // //           outstandingPromise = null;
      }
    });
    // setTimeout(function() {
    //   console.log('in timeout');
    //   reject(Error("timeout"));
    //   // outstandingPromise = null;
    // }, timeout);
// });
  });
  return outstandingPromise;
  // }
};

BluetoothManager.prototype.setNotifyEnabledAndWait = function(enabled, uuid, timeout = 2000) {
  debug('about to set notify enabled to ' + enabled);
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {
    // characteristic.once('notify', function(state) {
    //   console.log('notify state changed to ' + state);
    //   resolve();
    // });
    characteristic.subscribe(function(error) {
      if (error) {
        reject(error);
      }
      else {
        debug('successfully set notify enabled for ' + uuid + ' to ' + enabled);
        resolve();
      }
    });
    // setTimeout(() => {
    //   reject(Error("timeout"));
    //   // outstandingPromise = null;
    // }, timeout);
  });
  return outstandingPromise;
};

// if characteristic is notifying, wait for notification
// otherwise, wait for confirmation of write operation
BluetoothManager.prototype.writeValueAndWait = function(value, uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {

    // if we are waiting for a notification ...
    // characteristic.on('data', function(data, isNotification) {
    //   resolve(data);
    // });
    debug('about to try to write to ' + uuid);
    characteristic.write(value, true, function() {
      resolve();
      // setTimeout(function() {
      //   characteristic.read(function(error, data) {
      //     console.log(Profiling.now().toFixed(3) + ": read data " + data.toString('hex'));
      //     resolve(data);
      //   });
      // }, 300);
    });
    // setTimeout(() => {
    //   reject(Error("timeout"));
    //   // outstandingPromise = null;
    // }, timeout);
  });
  return outstandingPromise;
};

BluetoothManager.prototype.waitForNotification = function(uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {
    characteristic.once('data', data => {
      debug('got data ' + data.toString('hex'));
      if ((!firstByte) || (data[0] === firstByte)) {
        resolve(data);
      } else {
        reject('received ' + data[0].toString('hex') + ', expecting ' + firstByte.toString('hex'));
      }
    });
    characteristic.write(value, true);
    setTimeout(() => {
      reject('timeout');
      // outstandingPromise = null;
    }, timeout);
  });

  return outstandingPromise;
};

BluetoothManager.prototype.writeValueAndWaitForNotification = function(value, uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {

  // const callback = function callback(data) {
  //   debug('got data ' + data.toString('hex'));
  //   if ((!firstByte) || (data[0] === firstByte)) {
  //     characteristic.removeListener(callback);
  //     resolve(data);
  //   }
  // };
  //
  //  characteristic.on('data', callback);
  //
    characteristic.on('data', function callback(data) {
      debug('got data ' + data.toString('hex'));
      if ((!firstByte) || (data[0] === firstByte)) {
        characteristic.removeListener('data', callback);
        resolve(data);
      }
    });
    characteristic.write(value, true);
    // setTimeout(() => {
    //   reject(Error("timeout"));
    //   // outstandingPromise = null;
    // }, timeout);
  });

  return outstandingPromise;
};


// BluetoothManager.prototype.didUpdateValueFor = function(peripheral, characteristic) {


// BluetoothManager.prototype.writeValueAndWait = function(value, timeout) {
//   if (outstandingPromise) throw "inTheMiddleOfSomethingError"
//   outstandingPromise = new Promise(function(resolve, reject) {
//     // peripheral.writeValue(value, ...)
//
//     setTimeout(function() {
//       reject(Error("It broke"));
//       outstandingPromise = null;
//     }, timeout);
//   });
//   return outstandingPromise;
// }
//
// function didWriteValueFor(peripheral) {
// // might need some code here to check if what was written (and the characteristic written to)
// // is what was expected (like in xDripG5)
//   outstandingPromise.resolve();
//   outstandingPromise = null;
// }

module.exports = BluetoothManager;
