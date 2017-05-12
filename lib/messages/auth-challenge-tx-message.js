const opcode = 0x4;

function AuthChallengeTxMessage(challengeHash) {
  this.data = Buffer.concat([
    Buffer.from([opcode]),
    challengeHash
  ]);
}

AuthChallengeTxMessage.opcode = opcode;

module.exports = AuthChallengeTxMessage;
