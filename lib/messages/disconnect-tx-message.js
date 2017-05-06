const opcode = 0x09;

function DisconnectTxMessage() {
  this.data = Buffer.allocUnsafe(1, opcode);
}

module.exports = DisconnectTxMessage;
