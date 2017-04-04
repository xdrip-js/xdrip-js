var noble = require('noble');

// TODO: move these into their own file (bluetooth-services.js)
var AdvertisementUuid = 'FEBC';
var CGMServiceUuid = removeHyphens('F8083532-849E-531C-C594-30F1F86A4EA5');

var CommunicationUUID = removeHyphens('F8083533-849E-531C-C594-30F1F86A4EA5');
var ControlUUID = removeHyphens('F8083534-849E-531C-C594-30F1F86A4EA5');
var AuthenticationUUID = removeHyphens('F8083535-849E-531C-C594-30F1F86A4EA5');
var ProbablyBackfill = removeHyphens('F8083536-849E-531C-C594-30F1F86A4EA5');

var outstandingPromise = null;

function BluetoothManager () {
  noble.on('stateChange', this.onStateChange.bind(this));
  noble.on('discover', this.didDiscover.bind(this));
}

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
  var serviceUUIDs = [AdvertisementUuid, CGMServiceUuid];
  noble.startScanning(serviceUUIDs, false);
};

BluetoothManager.prototype.didDiscover = function(peripheral) {
  // we found a peripheral, stop scanning
  noble.stopScanning();

  console.log('found peripheral:', peripheral.advertisement);

  peripheral.connect(function(err) {
    peripheral.discoverServices([CGMServiceUuid], function(err, services) {
      services.forEach(function(service) {
        console.log('found service:', service.uuid);
        service.discoverCharacteristics([], function(err, characteristics) {

          characteristics.forEach(function(characteristic) {
            console.log('found characteristic:', characteristic.uuid);
          })
        })
      })
    })
  })
};

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

function removeHyphens(string) {
  return string.replace(/-/g, "");
}

module.exports = BluetoothManager;
