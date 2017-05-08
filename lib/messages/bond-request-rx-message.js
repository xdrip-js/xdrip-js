const opcode = 0x8;

function BondRequestRxMessage(data) {
  if ((data.length !== 2) || (data[0] != opcode)) {
    throw new Error('cannot create new BondRequestRxMessage');
  }
  this.succeeded = data[1];
}

BondRequestRxMessage.opcode = opcode;

module.exports = BondRequestRxMessage;

// NOTE: immediately after receiving a BondRequestTxMessage, the transmitter
// responds with the message 0x0801.

// Guessing that this is an acknowledgement of the bond request, with the second
// byte indicating success or otherwise. (I've only ever seen the one sequence of bytes.)
