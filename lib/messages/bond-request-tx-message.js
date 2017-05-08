const opcode = 0x7;

function BondRequestTxMessage() {
  this.data = Buffer.allocUnsafe(1);
  this.data.writeUInt8(opcode, 0);
}

module.exports = BondRequestTxMessage;
