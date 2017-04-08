var BluetoothManager = require('./bluetooth-manager');

// messages
var AuthStatusRxMessage = require('./messages/auth-status-rx-message');
var AuthRequestTxMessage = require('./messages/auth-request-tx-message');
var KeepAliveTxMessage = require('./messages/keep-alive-tx-message');
var BondRequestTxMessage = require('./messages/bond-request-tx-message');


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
  var uuid = UUID.CGMServiceCharacteristic.Authentication;
  manager.readValueAndWait(uuid)
  .then(data => new AuthStatusRxMessage(data))
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  .then(() => manager.setNotifyEnabledAndWait(true, uuid))
  .then(() => {
    var message = new AuthRequestTxMessage();
    console.log(Profiling.now().toFixed(3) + ': ' + message.data.toString('hex'));
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(data => console.log(Profiling.now().toFixed(3) + ': ' + data.toString('hex')))
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  .then(() => {
    var message = new KeepAliveTxMessage(25);
    return manager.writeValueAndWait(message.data, uuid);
  })
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  .then(() => {
    var message = new BondRequestTxMessage();
    return manager.writeValueAndWait(message.data, uuid, '0x01', 15000);
  })
  .then(data => console.log(Profiling.now().toFixed(3) + ': ' + data.toString('hex')))
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
