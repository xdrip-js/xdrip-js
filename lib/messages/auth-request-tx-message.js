const uuid = require('uuid/v4');
const opcode = Buffer.allocUnsafe(1).fill(0x1);
const endByte = Buffer.allocUnsafe(1).fill(0x2);

function AuthRequestTxMessage() {
  // this.data = Buffer.allocUnsafe(10);
  const id = Buffer.allocUnsafe(16);
  uuid(null, id);

  this.singleUseToken = Buffer.allocUnsafe(8).fill(id);

  // this.data.fill(opcode, 0);
  // this.data.fill(singleUseToken, 1, 8);
  // this.data.fill(endByte, 9);
  this.data = Buffer.concat([opcode, this.singleUseToken, endByte]);
}

module.exports = AuthRequestTxMessage;
