const uuid = require('uuid/v4');

const opcode = 0x1;
const endByte = 0x2;

function AuthRequestTxMessage() {
  const id = Buffer.allocUnsafe(16);
  uuid(null, id);

  this.singleUseToken = Buffer.allocUnsafe(8).fill(id);

  this.data = Buffer.concat([
    Buffer.from([opcode]),
    this.singleUseToken,
    Buffer.from([endByte])
  ]);
}

AuthRequestTxMessage.opcode = opcode;

module.exports = AuthRequestTxMessage;
