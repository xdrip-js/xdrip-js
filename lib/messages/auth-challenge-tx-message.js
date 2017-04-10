const opcode = Buffer.allocUnsafe(1).fill(0x4);

function AuthChallengeTxMessage(challengeHash) {
  this.data = Buffer.concat([opcode, challengeHash]);
}

module.exports = AuthChallengeTxMessage;
