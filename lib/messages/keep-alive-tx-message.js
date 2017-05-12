const opcode = 0x6;

function KeepAliveTxMessage(time) {
  this.data = Buffer.from([opcode, time]);
}

KeepAliveTxMessage.opcode = opcode;

module.exports = KeepAliveTxMessage;
