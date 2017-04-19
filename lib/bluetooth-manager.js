var noble = require('noble');
//var events = require('events');
//var util = require('util');
var UUID = require('./bluetooth-services');
var Profiling = require('./profiling');

var outstandingPromise = null;

var BluetoothOperationCondition = {
  notificationStateUpdate: function(characteristic, enabled) {
    this.toString = function() {return "op1:" + characteristic + ":" + enabled;};
  },
  valueUpdate: function(characteristic, firstByte) {
    this.toString = function() {return "op2:" + characteristic + ":" + firstByte;};
  },
  writeUpdate: function(characteristic) {
    this.toString = function() {return "op3:" + characteristic;};
  }
};

var operationConditions = new Set();

var characteristicsMap = new Map();

operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());
operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", false).toString());
operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());

console.log(operationConditions);

var delegate;

function BluetoothManager(del) {
  delegate = del;
  this.peripheral = null;
  noble.on('stateChange', this.onStateChange.bind(this));
  noble.on('discover', this.didDiscover.bind(this));
}

//util.inherits(BluetoothManager, events.EventEmitter);

BluetoothManager.prototype.onStateChange = function(state) {
  if (state === 'poweredOn') {
    console.log('starting scanning');
    this.scanForPeripheral();
  } else {
    console.log('stopping scanning');
    noble.stopScanning();
  }
};

BluetoothManager.prototype.scanForPeripheral = function() {
  var serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  noble.startScanning(serviceUUIDs, false);
};

BluetoothManager.prototype.didDiscover = function(peripheral) {
  // we found a peripheral, stop scanning
  console.log(Date() + ': peripheral: ' + peripheral.advertisement.localName + ' with rssi ' + peripheral.rssi);
  if (!delegate.shouldConnect(peripheral)) return;
  self = this;
  noble.stopScanning();

  this.peripheral = peripheral;

  var undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic).map(k => UUID.CGMServiceCharacteristic[k]));

  peripheral.connect(function(err) {
    peripheral.discoverServices([UUID.TransmitterService.CGMService], function(err, services) {
      services.forEach(function(service) {
        service.discoverCharacteristics([], function(err, characteristics) {
          // var index = 0;
          // characteristics.forEach(function(characteristic) {
          for (var characteristic of characteristics) {
            var uuid = characteristic.uuid.toUpperCase();
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
  var characteristic = characteristicsMap.get(uuid);
  // console.log('in readValueAndWait, now have characteristic ' + characteristic);
  outstandingPromise = new Promise(function(resolve, reject) {
    // characteristic.on('data', function(data, isNotification) {
    //   console.log('data read');
    //   resolve(data);
    // });
    characteristic.read(function(error, data) {
      if (data) {
  // //           var conditon = new BluetoothOperationCondition.valueUpdate(uuid, data[0])
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
  console.log('in authenticate, about to set notify enabled');
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
        console.log(Profiling.now().toFixed(3) + ": successfully set notify enabled for " + uuid);
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
    console.log(Profiling.now().toFixed(3) + ": about to try to write to " + uuid);
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

BluetoothManager.prototype.writeValueAndWaitForNotification = function(value, uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {
    characteristic.once('data', function(data, isNotification) {
      console.log(Profiling.now() + ': got data ' + data.toString('hex') + ', isNotification = ' + isNotification);
      // if (isNotification) resolve(data);
      resolve(data);
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
