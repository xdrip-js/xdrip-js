var BluetoothManager = require('./bluetooth-manager');

var manager = new BluetoothManager();

function Transmitter(id) {
  this.id = id;
}

module.exports = Transmitter;
