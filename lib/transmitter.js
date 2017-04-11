var crypto = require('crypto');

var BluetoothManager = require('./bluetooth-manager');

// messages
var AuthStatusRxMessage = require('./messages/auth-status-rx-message');
var AuthRequestTxMessage = require('./messages/auth-request-tx-message');
var KeepAliveTxMessage = require('./messages/keep-alive-tx-message');
var BondRequestTxMessage = require('./messages/bond-request-tx-message');
var AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message');
var AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message');
var GlucoseTxMessage = require('./messages/glucose-tx-message');

var UUID = require('./bluetooth-services');
var Profiling = require('./profiling');

var manager = new BluetoothManager();
var cryptKey;

function Transmitter(id) {
  this.id = id;
  cryptKey = '00' + id + '00' + id;
  manager.on('ready', this.onReady.bind(this));
}

Transmitter.prototype.onReady = function() {
  console.log("bluetooth is ready");
  authenticate()
//  authenticate.call(this); // this is an alternative, if we want the fn to have access to this
  .then(control);
};


// should this be Transmitter.prototype.authenticate ... ???
// maybe not? private?
function authenticate() {
  var uuid = UUID.CGMServiceCharacteristic.Authentication;

  return manager.readValueAndWait(uuid)
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
      return response;
    });
  })
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  .then(response => {
    var challengeHash = calculateHash(response.challenge);
    console.log('challengeHash: ' + challengeHash.toString('hex'));
    var message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWait(message.data, uuid)
  })
  .then(data => console.log(data))
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
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  .then(() => manager.setNotifyEnabledAndWait(false, uuid));
}

function control() {
  var uuid = UUID.CGMServiceCharacteristic.Control;

  return manager.setNotifyEnabledAndWait(true, uuid)
  .then(() => {
    var message = new GlucoseTxMessage();
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(data => console.log('glucose data: ' + data.toString('hex')))
  .then(() => manager.setNotifyEnabledAndWait(false, uuid));
}

function calculateHash(data) {
  if (data.length != 8) {
    throw Error('cannot hash');
  }

  var doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  var encrypted = encrypt(doubleData);
  return Buffer.allocUnsafe(8).fill(encrypted);
}

function encrypt(buffer){
  var algorithm = 'aes-128-ecb';
  console.log('cryptKey = ' + cryptKey);
  var cipher = crypto.createCipheriv(algorithm, cryptKey, '');
  var encrypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  return encrypted;
}

module.exports = Transmitter;
