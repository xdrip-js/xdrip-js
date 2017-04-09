AESCrypt = require('aescrypt');
var crypto = require('crypto');

var BluetoothManager = require('./bluetooth-manager');

// messages
var AuthStatusRxMessage = require('./messages/auth-status-rx-message');
var AuthRequestTxMessage = require('./messages/auth-request-tx-message');
var KeepAliveTxMessage = require('./messages/keep-alive-tx-message');
var BondRequestTxMessage = require('./messages/bond-request-tx-message');
var AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message');


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
    return manager.writeValueAndWait(message.data, uuid)
    .then(data => {
      console.log(Profiling.now().toFixed(3) + ': ' + data.toString('hex'));
      var response = new AuthChallengeRxMessage(data);
      console.log('***    tokenHash:    ***');
      console.log(response.tokenHash);
      console.log('***    my hash:      ***')
      console.log(calculateHash(message.singleUseToken));
      var passedChallenge = response.tokenHash.equals(calculateHash(message.singleUseToken));
      if (!passedChallenge) {
        throw Error("Transmitter failed auth challenge");
      }
    });
  })
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

var cryptKey = '0040M0CA0040M0CA';

function calculateHash(data) {
  if (data.length != 8) {
    throw Error('cannot hash');
  }

  var doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  // console.log('cryptKey: ' + cryptKey);
  // console.log('data: ' + doubleData.toString('hex'));

  var encrypted = encrypt(doubleData);
  // console.log('encrypted: ' + encrypted.toString('hex'));


  // var outString = AESCrypt.encryptWithSalt(cryptKey, doubleData.toString('hex'));
  // console.log('outString: ' + outString.encrypted);
  // var outData = Buffer.from(outString.encrypted);

  return Buffer.allocUnsafe(8).fill(encrypted);
}

function encrypt(buffer){
  // var algorithm = 'aes-256-ctr'; // could also try 'aes-128-cbc'
  var algorithm = 'aes-128-ecb'; // could also try 'aes-128-cbc'
  var cipher = crypto.createCipheriv(algorithm, cryptKey, '');
  var crypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  return crypted;
}

module.exports = Transmitter;
