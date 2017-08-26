const opcode = 0x8;

function BondRequestRxMessage(data) {
  if ((data.length !== 2) || (data[0] !== opcode)) {
    throw new Error('cannot create new BondRequestRxMessage');
  }
  this.succeeded = data[1];
}

BondRequestRxMessage.opcode = opcode;

module.exports = BondRequestRxMessage;
