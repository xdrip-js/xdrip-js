const uuid = require('uuid/v4');

const opcode = 0xc;

function SignChallengeTxMessage(challenge) {

  const id = uuid(null, Buffer.allocUnsafe(16));
  this.singleUseToken = Buffer.allocUnsafe(16).fill(id);

  this.data = Buffer.concat([
    Buffer.from([opcode]),
    Buffer.from([challenge]),
    this.singleUseToken,
  ]);
}

SignChallengeTxMessage.opcode = opcode;

module.exports = SignChallengeTxMessage;

