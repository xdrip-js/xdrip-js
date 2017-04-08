const uuid = require('uuid/v4');
const opcode = 0x1;
const endByte = 0x2;

function AuthRequestTxMessage() {
  this.data = Buffer.allocUnsafe(10);
  const singleUseToken = new Buffer.allocUnsafe(16);
  uuid(null, singleUseToken);

  this.data.fill(opcode, 0);
  this.data.fill(singleUseToken, 1, 8);
  this.data.fill(endByte, 9);
}

module.exports = AuthRequestTxMessage;
