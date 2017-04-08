var noble = require('noble');
var events = require('events');
var util = require('util');
var UUID = require('./bluetooth-services');
var Profiling = require('./profiling');

var outstandingPromise = null;

var BluetoothOperationCondition = {
  notificationStateUpdate: function(characteristic, enabled) {
    this.toString = function() {return "op1:" + characteristic + ":" + enabled;}
  },
  valueUpdate: function(characteristic, firstByte) {
    this.toString = function() {return "op2:" + characteristic + ":" + firstByte;}
  },
  writeUpdate: function(characteristic) {
    this.toString = function() {return "op3:" + characteristic;}
  }
}

var operationConditions = new Set();

var characteristicsMap = new Map();

operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());
operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", false).toString());
operationConditions.add(new BluetoothOperationCondition.notificationStateUpdate("some char", true).toString());

console.log(operationConditions);

function BluetoothManager () {
  this.peripheral = null;
  noble.on('stateChange', this.onStateChange.bind(this));
  noble.on('discover', this.didDiscover.bind(this));
}

util.inherits(BluetoothManager, events.EventEmitter);

BluetoothManager.prototype.onStateChange = function(state) {
  if (state === 'poweredOn') {
    console.log('starting scanning')
    this.scanForPeripheral();
  } else {
    console.log('stopping scanning')
    noble.stopScanning();
  }
};

BluetoothManager.prototype.scanForPeripheral = function() {
  var serviceUUIDs = [UUID.TransmitterService.Advertisement, UUID.TransmitterService.CGMService];
  noble.startScanning(serviceUUIDs, false);
};

BluetoothManager.prototype.didDiscover = function(peripheral) {
  // we found a peripheral, stop scanning
  self = this;
  noble.stopScanning();

  this.peripheral = peripheral;

  var undiscoveredUUIDs = new Set(Object.keys(UUID.CGMServiceCharacteristic).map(k => UUID.CGMServiceCharacteristic[k]))

  peripheral.connect(function(err) {
    peripheral.discoverServices([UUID.TransmitterService.CGMService], function(err, services) {
      services.forEach(function(service) {
        service.discoverCharacteristics([], function(err, characteristics) {
          // var index = 0;
          // characteristics.forEach(function(characteristic) {
          for (var characteristic of characteristics) {
            // index = index + 1;
            console.log('found characteristic:', characteristic.uuid);
            var uuid = characteristic.uuid.toUpperCase();
            if (undiscoveredUUIDs.has(uuid)) {
              characteristicsMap.set(uuid, characteristic);
              undiscoveredUUIDs.delete(uuid);
            }
            if (undiscoveredUUIDs.size == 0) {
               self.emit('ready');
               break;
            }
            // better to add keys to an array and then lose then as they are found
            // can get them as Object.keys(UUID.CGMServiceCharacteristic)
            // for (var key in UUID.CGMServiceCharacteristic) {
            //   if (UUID.CGMServiceCharacteristic.hasOwnProperty(key)) {
            //     var uuid = UUID.CGMServiceCharacteristic[key];
            //     if (characteristic.uuid.toUpperCase() === uuid.toUpperCase()) {
            //       characteristicsMap.set(uuid, characteristic);
            //     }
            //   }
            // }
            // if (characteristic.uuid.toUpperCase() === AuthenticationUUID.toUpperCase()) {
            //   console.log("found authentication");
            //   characteristic.read(function(error, data) {
            //     if (data) {
            //       console.log("read " + data.toString('hex') + " for " + characteristic);
            //     }
            //     else {
            //       console.log("error " + error + " for " + characteristic);
            //     }
            //   });
            // }
          }
        })
      });
    });
  });
};

function getCharacteristicWithUUID(uuid) {

}

BluetoothManager.prototype.readValueAndWait = function(uuid, firstByte, timeout = 2000) {
// //   if (!outstandingPromise && peripheral) {
  var characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {
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
      setTimeout(function() {
        reject(Error("timeout"));
        // outstandingPromise = null;
      }, timeout);
    });
// });
  });
  return outstandingPromise;
  // }
}

BluetoothManager.prototype.setNotifyEnabledAndWait = function(enabled, uuid, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {
    characteristic.subscribe(function(error) {
      if (error) {
        reject(error);
      }
      else {
        console.log(Profiling.now().toFixed(3) + ": successfully set notify enabled for " + uuid);
        resolve();
      }
      setTimeout(() => {
        reject(Error("timeout"));
        // outstandingPromise = null;
      }, timeout);
    });
  });
  return outstandingPromise;
}

BluetoothManager.prototype.writeValueAndWait = function(value, uuid, firstByte, timeout = 2000) {
  const characteristic = characteristicsMap.get(uuid);
  outstandingPromise = new Promise(function(resolve, reject) {
    characteristic.on('data', function(data, isNotification) {
      resolve(data);
    });
    setTimeout(() => {
      console.log(Profiling.now().toFixed(3) + ": about to try to write to " + uuid);
      characteristic.write(value, true, function() {
        console.log(Profiling.now().toFixed(3) + ": successfully written to " + uuid);
      });
    }, 10000);
    setTimeout(() => {
      reject(Error("timeout"));
      // outstandingPromise = null;
    }, 20000);
  });
  return outstandingPromise;
}
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
