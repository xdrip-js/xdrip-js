const uuid = require('uuid/v4');

const opcode = 0x2;
const endByteStd = 0x2;
const endByteAlt = 0x1;

function AuthRequestTxMessage2(alt, chal) {
  const id = uuid(null, Buffer.allocUnsafe(16));
  this.singleUseToken = Buffer.allocUnsafe(8).fill(id);

  const chalByte = chal.length > 2 ? chal[2] : 0;

  this.data = Buffer.concat([
    Buffer.from([opcode]),
    this.singleUseToken,
    Buffer.from(((!alt) ? [endByteStd] : [endByteAlt])),
    Buffer.from([chalByte]),
  ]);
}

AuthRequestTxMessage2.opcode = opcode;

module.exports = AuthRequestTxMessage2;
