const crypto = require('crypto');
const events = require('events');
const util = require('util');

const BluetoothManager = require('./bluetooth-manager');

// messages
const AuthStatusRxMessage = require('./messages/auth-status-rx-message');
const AuthRequestTxMessage = require('./messages/auth-request-tx-message');
const KeepAliveTxMessage = require('./messages/keep-alive-tx-message');
const BondRequestTxMessage = require('./messages/bond-request-tx-message');
const AuthChallengeRxMessage = require('./messages/auth-challenge-rx-message');
const AuthChallengeTxMessage = require('./messages/auth-challenge-tx-message');
const TransmitterTimeTxMessage = require('./messages/transmitter-time-tx-message');
const TransmitterTimeRxMessage = require('./messages/transmitter-time-rx-message');
const GlucoseTxMessage = require('./messages/glucose-tx-message');
const BatteryStatusTxMessage = require('./messages/battery-status-tx-message');

const UUID = require('./bluetooth-services');
const Profiling = require('./profiling');

let manager;
let cryptKey;

function Transmitter(id) {
  this.id = id;
  cryptKey = '00' + id + '00' + id;
  manager = new BluetoothManager(this);
  setTimeout(() => {
    this.emit('glucose', '310000000000632ad3000100017f8558'); // testing only
  }, 3000);
}

util.inherits(Transmitter, events.EventEmitter);

Transmitter.prototype.shouldConnect = function(peripheral) {
  const name = peripheral.advertisement.localName;
  return lastTwoCharactersOfString(name) == lastTwoCharactersOfString(this.id);
};

Transmitter.prototype.isReady = function() {
  console.log("bluetooth is ready");
  authenticate.call(this)
  .then(control.bind(this));
};


// should this be Transmitter.prototype.authenticate ... ???
// maybe not? private?
function authenticate() {
  console.log('in authenticate');
  const uuid = UUID.CGMServiceCharacteristic.Authentication;
  console.log('in authenticate, about to call readValueAndWait');
  // return manager.readValueAndWait(uuid)
  // .then(data => new AuthStatusRxMessage(data))
  // .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
  // .then(() => manager.setNotifyEnabledAndWait(true, uuid))
  // .catch(reason => console.log(Profiling.now().toFixed(3) + ': ' + reason))
//
 // return manager.setNotifyEnabledAndWait(true, uuid)
  // .then(() => {
  //   const message = new BatteryStatusTxMessage();
  //   return manager.writeValueAndWait(message.data, uuid);
  // })
  // .then((data) => console.log('Battery status :' + data.toString('hex')))
  // .then(() => {
  const message = new AuthRequestTxMessage();
  console.log(Profiling.now().toFixed(3) + '=> auth request: ' + message.data.toString('hex'));

  Profiling.reset();
  console.log('1. send auth-request-tx-message and listen for write event');
  return manager.writeValueAndWait(message.data, uuid)
  .then(() => {
    console.log('2. on write, read characteristic and wait for read event');
    return manager.readValueAndWait(uuid);
  })
  .then(data => {
    console.log('3. on read, expect an auth-challenge-rx-message, create new message from data');
    console.log('read ' + data.toString('hex') + ' after ' + Profiling.now() + ' seconds.');
    const response = new AuthChallengeRxMessage(data);
    // console.log('***    tokenHash:    ***');
    // console.log(response.tokenHash);
    // console.log('***    my hash:      ***')
    // console.log(calculateHash(message.singleUseToken));
    console.log('4. hash the challenge, create new auth-challenge-tx-message and write this to auth characteristic');
    const passedChallenge = response.tokenHash.equals(calculateHash(message.singleUseToken));
    if (!passedChallenge) {
      throw Error("Transmitter failed auth challenge");
    }
    return response;
  })
  .then(response => {
    const challengeHash = calculateHash(response.challenge);
    console.log('challengeHash: ' + challengeHash.toString('hex'));
    const message = new AuthChallengeTxMessage(challengeHash);
    Profiling.reset();
    return manager.writeValueAndWait(message.data, uuid);
  })
  .then(() => {
    console.log('5. on write, read characteristic and wait for read event');
    return manager.readValueAndWait(uuid);
  })
  .then(data => {
    console.log('6. on read, expect auth-status-rx-message, check authenticated and bonded');
    console.log('read ' + data.toString('hex') + ' after ' + Profiling.now() + ' seconds.');
    // really, need some logic here to deal with different responses...
    // (are we authenticated? are we bonded?)
    // const message = new AuthStatusRxMessage(data);
    // if (message.authenticated) ...
    // if (message.bonded) ...
    console.log('7. (depending on result of 6) create new keep-alive-tx-message with 25 s and write');
    const message = new KeepAliveTxMessage(25);
    Profiling.reset();
    return manager.writeValueAndWait(message.data, uuid);
  })
  // .then(() => manager.readValueAndWait(uuid))
  .then(() => {
    console.log('8. on write, expect keep-alive opcode, perform bond write');
    // expect keepalive opcode (0x6)
    const message = new BondRequestTxMessage();
    // 0x01 here just as placeholder
    return manager.writeValueAndWait(message.data, uuid, '0x01', 15000);
  })
  .then(() => manager.readValueAndWait(uuid))
  .then(data => console.log);
}

function control() {
  console.log('***   starting control     ***');
  const uuid = UUID.CGMServiceCharacteristic.Control;

  return manager.setNotifyEnabledAndWait(true, uuid)
  .then(() => {
    const message = new TransmitterTimeTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid);
  })
  .then(data => new TransmitterTimeRxMessage(data))
  .then(message => console.log('message: ' + message))
//  .then(data => console.log(data.toString('hex')))
  .then(() => {
    console.log('creating glucose tx message');
    const message = new GlucoseTxMessage();
    return manager.writeValueAndWaitForNotification(message.data, uuid);
  })
//  .then(() => manager.waitForNotification(uuid))
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

  const doubleData = Buffer.allocUnsafe(16);
  doubleData.fill(data, 0, 8);
  doubleData.fill(data, 8, 16);

  const encrypted = encrypt(doubleData);
  return Buffer.allocUnsafe(8).fill(encrypted);
}

function encrypt(buffer){
  const algorithm = 'aes-128-ecb';
  const cipher = crypto.createCipheriv(algorithm, cryptKey, '');
  const encrypted = Buffer.concat([cipher.update(buffer),cipher.final()]);
  return encrypted;
}

function lastTwoCharactersOfString(string) {
  return string.substr(string.length - 2);
}

module.exports = Transmitter;
