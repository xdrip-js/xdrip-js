var noble = require('noble');

// TODO: move these into their own file (bluetooth-services.js)
var AdvertisementUuid = 'FEBC';
var CGMServiceUuid = removeHyphens('F8083532-849E-531C-C594-30F1F86A4EA5');

var CommunicationUUID = removeHyphens('F8083533-849E-531C-C594-30F1F86A4EA5');
var ControlUUID = removeHyphens('F8083534-849E-531C-C594-30F1F86A4EA5');
var AuthenticationUUID = removeHyphens('F8083535-849E-531C-C594-30F1F86A4EA5');
var ProbablyBackfill = removeHyphens('F8083536-849E-531C-C594-30F1F86A4EA5');

function BluetoothManager () {
  var self = this;
  noble.on('stateChange', function(state){
    if (state === 'poweredOn') {
      console.log('starting scanning')
      self.scanForPeripheral();
    } else {
      console.log('stopping scanning')
      noble.stopScanning();
    }
  });
  noble.on('discover', didDiscover);
};

BluetoothManager.prototype.scanForPeripheral = function () {
  var serviceUUIDs = [AdvertisementUuid, CGMServiceUuid];
  noble.startScanning(serviceUUIDs, false);
};

function didDiscover(peripheral) {
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
}

function removeHyphens(string) {
  return string.replace(/-/g, "");
}

module.exports = BluetoothManager;
