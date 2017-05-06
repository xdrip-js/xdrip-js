const opcode = 0x6;

function KeepAliveTxMessage(time) {
  this.data = Buffer.allocUnsafe(2);
  this.data.writeUInt8(opcode, 0);
  this.data.writeUInt8(time, 1);
}

module.exports = KeepAliveTxMessage;
