const opcode = 0x6;

function UnbondRequestTxMessage() {
  this.data = Buffer.from([opcode]);
}

UnbondRequestTxMessage.opcode = opcode;

module.exports = UnbondRequestTxMessage;

