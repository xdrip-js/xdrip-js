const opcode = 0x7;

function BondRequestTxMessage() {
  this.data = Buffer.from([opcode]);
}

BondRequestTxMessage.opcode = opcode;

module.exports = BondRequestTxMessage;
