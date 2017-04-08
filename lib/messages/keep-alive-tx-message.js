const opcode = 0x6;

function KeepAliveTxMessage(time) {
  console.log('creating new KeepAliveTxMessage with time ' + time);
  this.data = Buffer.allocUnsafe(2);
  this.data.writeUInt8(opcode, 0);
  this.data.writeUInt8(time, 1);
  console.log('KeepAliveTxMessage: ' + this.data.toString('hex'));
}

module.exports = KeepAliveTxMessage;
