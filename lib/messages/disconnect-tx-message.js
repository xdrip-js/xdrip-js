const opcode = 0x09;

function DisconnectTxMessage() {
  this.data = Buffer.from([opcode]);
}

DisconnectTxMessage.opcode = opcode;

module.exports = DisconnectTxMessage;
