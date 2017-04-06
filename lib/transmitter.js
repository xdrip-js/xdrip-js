var BluetoothManager = require('./bluetooth-manager');
var AuthStatusRxMessage = require('./messages/auth-status-rx-message');
var UUID = require('./bluetooth-services');

var manager = new BluetoothManager();

function Transmitter(id) {
  this.id = id;
  manager.on('ready', this.onReady.bind(this));
}

Transmitter.prototype.onReady = function() {
  console.log("bluetooth is ready");
  authenticate()
};

// should this be Transmitter.prototype.authenticate ... ???
function authenticate() {
  manager.readValueForCharacteristicAndWait(UUID.CGMServiceCharacteristic.Authentication)
  .then(function(data) {
    console.log(data.toString('hex'));
    var message = new AuthStatusRxMessage(data);
  });
  // .then(function(data) {
  //   console.log("Read auth characteristic: " + data);
  //   // return new AuthStatusRxMessage(data);
  // }, function(reason) {
  //   console.log("Failed to read auth characteristic: " + reason);
  // });
//   manager.writeValueAndWait(authMessage, ...)
//   .then(function(data) {
//     return AuthChallengeRxMessage(data)
//   })
//   .then(function(response) {
//     // etc.
//   })
}

module.exports = Transmitter;
