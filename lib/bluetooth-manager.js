const noble = require('noble');
//const events = require('events');
//const util = require('util');
const UUID = require('./bluetooth-services');
const Profiling = require('./profiling');

let outstandingPromise = null;

const BluetoothOperationCondition = {
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

const operationConditions = new Set();

const characteristicsMap = new Map();

operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());
operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", false).toString());
operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());

console.log(operationConditions);

let delegate;

function BluetoothManager(del) {
  delegate = del;
  this.peripheral = null;
  noble.on('stateChange', this.onStateChange.bind(this));
  noble.on('discover', this.didDiscover.bind(this));
  noble.on('scanStart', function() {
    console.log('on -> scanStart');
  });
  noble.on('scanStop', function() {
    console.log('on -> scanStop');
  });
}

//util.inherits(BluetoothManager, events.EventEmitter);

BluetoothManager.prototype.onStateChange = function(state) {
  console.log('on -> stateChange: ' + state);

  if (state === 'poweredOn') {
    console.log('starting scanning');
    this.scanForPeripheral();
  } else {
    console.log('stopping scanning');
    noble.stopScanning();
  }
};

BluetoothManager.prototype.scanForPeripheral = function() {
  const serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  //noble.startScanning(serviceUUIDs, false);
  // let's not limit ourselves
  noble.startScanning();
};

BluetoothManager.prototype.didDiscover = function(peripheral) {
  // we found a peripheral, stop scanning
  console.log('on -> discover: ' + peripheral);
  console.log(Date() + ': peripheral: ' + peripheral.advertisement.localName + ' with rssi ' + peripheral.rssi);
  if (!delegate.shouldConnect(peripheral)) return;
  noble.stopScanning();
  console.log('connecting!');
  self = this;

  this.peripheral = peripheral;

  const undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic).map(k => UUID.CGMServiceCharacteristic[k]));

  console.log('about to call connect on peripheral!');
  peripheral.connect(function(err) {
    console.log('in connect callback!');
    if (err) console.log(err);
//    peripheral.discoverServices([UUID.TransmitterService.CGMService], function(err, services) {
      peripheral.discoverServices([], function(err, services) {
      // console.log('in discoverServices callback! services.length = ' + services.length);
      // console.log('UUID of discoveredService = ' + services[0].uuid);
      if (err) console.log(err);
      services.forEach(function(service) {
        service.discoverCharacteristics([], function(err, characteristics) {
          console.log('in discoverCharacteristics callback! characeristics.length = ' + characteristics.length);
          if (err) console.log(err);
          // const index = 0;
          // characteristics.forEach(function(characteristic) {
          for (let characteristic of characteristics) {
            console.log('got characteristic ' + characteristic);
            const uuid = characteristic.uuid.toUpperCase();
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
