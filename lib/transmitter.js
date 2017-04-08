var BluetoothManager = require('./bluetooth-manager');
var AuthStatusRxMessage = require('./messages/auth-status-rx-message');
var AuthRequestTxMessage = require('./messages/auth-request-tx-message');
var UUID = require('./bluetooth-services');
var Profiling = require('./profiling');

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
// maybe not? private?
function authenticate() {
  manager.readValueAndWait(UUID.CGMServiceCharacteristic.Authentication)
  .then(data => new AuthStatusRxMessage(data))
  .then(() => manager.setNotifyEnabledAndWait(true, UUID.CGMServiceCharacteristic.Authentication))
  .then(() => {
    var message = new AuthRequestTxMessage();
    return manager.writeValueAndWait(message.data, UUID.CGMServiceCharacteristic.Authentication);
  })
  .then(data => console.log(Profiling.now().toFixed(3) + ': ' + data))
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason));
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
