const Util = require('../keks_plugin/util'); // For getRandomKey()

const opcode = 0x1;
const endByteStd = 0x2;
const endByteAlt = 0x1;

function AuthRequestTxMessage(alt) {
  const id = Util.getRandomKey(); // 16 bytes from crypto.randomBytes(16)
  this.singleUseToken = Buffer.allocUnsafe(8).fill(id);

  this.data = Buffer.concat([
    Buffer.from([opcode]),
    this.singleUseToken,
    Buffer.from(((!alt) ? [endByteStd] : [endByteAlt])),
  ]);
}

AuthRequestTxMessage.opcode = opcode;

module.exports = AuthRequestTxMessage;
