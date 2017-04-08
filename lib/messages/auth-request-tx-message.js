const uuid = require('uuid/v4');

function AuthRequestTxMessage() {
  const opcode = Buffer.alloc(1).fill(0x1);
  const endByte = Buffer.alloc(1).fill(0x2);
  const singleUseToken = new Buffer.alloc(16);

  uuid(null, singleUseToken);
  this.data = Buffer.concat([opcode, singleUseToken, endByte]);
}

module.exports = AuthRequestTxMessage;
