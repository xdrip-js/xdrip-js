const opcode = 0x7;

function BondRequestTxMessage() {
  console.log('creating new BondRequestTxMessage');
  this.data = Buffer.allocUnsafe(1);
  this.data.writeUInt8(opcode, 0);
  console.log('BondRequestTxMessage: ' + this.data.toString('hex'));
}

module.exports = BondRequestTxMessage;
