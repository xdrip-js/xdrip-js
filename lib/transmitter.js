var crypto = require('crypto');
var events = require('events');
var util = require('util');

var BluetoothManager = require('./bluetooth-manager');

// messages
var AuthStatusRxMessage = require('./messages/auth-status-rx-message');
var AuthRequestTxMessage = require('./messages/auth-request-tx-message');
var KeepAliveTxMessage = require('./messages/keep-alive-tx-message');
var BondRequestTxMessage = require('./messages/bond-request-tx-message');
var AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message');
var AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message');
var TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message');
var GlucoseTxMessage = require('./messages/glucose-tx-message');
var BatteryStatusTxMessage = require('./messages/battery-status-tx-message');

var UUID = require('./bluetooth-services');
var Profiling = require('./profiling');

var manager;
var cryptKey;

function Transmitter(id) {
  this.id = id;
  cryptKey = '00' + id + '00' + id;
  manager = new BluetoothManager(this);
//  manager.on('ready', this.onReady.bind(this));
}

util.inherits(Transmitter, events.EventEmitter);

Transmitter.prototype.shouldConnect = function(peripheral) {
  var name = peripheral.advertisement.localName;
  return lastTwoCharactersOfString(name) == lastTwoCharactersOfString(this.id);
}

Transmitter.prototype.isReady = function() {
  console.log("bluetooth is ready");
  authenticate.call(this)
  // .then(control.call(this));

  //authenticate()
  // .then(control.call(this));
};


// should this be Transmitter.prototype.authenticate ... ???
// maybe not? private?
function authenticate() {
  console.log('in authenticate');
  var uuid = UUID.CGMServiceCharacteristic.Authentication;
  console.log('in authenticate, about to call readValueAndWait');
  // return manager.readValueAndWait(uuid)
  // .then(data => new AuthStatusRxMessage(data))
  // .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  // .then(() => manager.setNotifyEnabledAndWait(true, uuid))
  // .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
//
 // return manager.setNotifyEnabledAndWait(true, uuid)
  // .then(() => {
  //   var message = new BatteryStatusTxMessage();
  //   return manager.writeValueAndWait(message.data, uuid);
  // })
  // .then((data) => console.log('Battery status :' + data.toString('hex')))
  // .then(() => {
    var message = new AuthRequestTxMessage();
    console.log(Profiling.now().toFixed(3) + '=> auth request: ' + message.data.toString('hex'));

    return manager.writeValueAndWait(message.data, uuid)
//    .then(() => manager.readValueAndWait(uuid))
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
    })
  // })
  .then(response => {
    var challengeHash = calculateHash(response.challenge);
    console.log('challengeHash: ' + challengeHash.toString('hex'));
    var message = new AuthChallengeTxMessage(challengeHash);
    return manager.writeValueAndWait(message.data, uuid)
  })
//  .then(() => manager.readValueAndWait(uuid))
  .then(data => console.log(data))
  // really, need some logic here to deal with different responses...
  .then(() => {
    var message = new KeepAliveTxMessage(25);
    return manager.writeValueAndWait(message.data, uuid);
  })
//  .then(() => manager.readValueAndWait(uuid))
  .then(data => console.log(data))
  // expect keep alive opcode (0x6)
  .then(() => {
    var message = new BondRequestTxMessage();
    return manager.writeValueAndWait(message.data, uuid, '0x01', 15000);
  })
  .then(data => console.log(Profiling.now().toFixed(3) + ': ' + data.toString('hex')))
//  .then(() => manager.setNotifyEnabledAndWait(false, uuid))
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason));
}

function control() {
  var uuid = UUID.CGMServiceCharacteristic.Control;

  return manager.setNotifyEnabledAndWait(true, uuid)
  .then(() => {
    var message = new TransmitterTimeTxMessage();
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(data => new TransmitterTimeRxMessage)
  .then(message => console.log)
  .then(() => {
    var message = new GlucoseTxMessage();
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(data => this.emit('glucose', data.toString('hex')))
  .then(() => manager.setNotifyEnabledAndWait(false, uuid))
  .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason));
}


//        guard let timeMessage = TransmitterTimeRxMessage(data: timeData) else {
//            throw TransmitterError.controlError("Unable to parse time response: \(timeData.hexadecimalString)")
//        }

//        let activationDate = Date(timeIntervalSinceNow: -TimeInterval(timeMessage.currentTime))


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

function lastTwoCharactersOfString(string) {
  var lastTwo = string.substr(string.length - 2);
  console.log(lastTwo);
  return lastTwo;
}


module.exports = Transmitter;
