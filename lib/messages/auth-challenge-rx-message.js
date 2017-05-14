const opcode = 0x3;

function AuthChallengeRxMessage(data) {
  if ((data.length !== 17) || (data[0] !== opcode)) {
    throw new Error('cannot create new AuthChallengeRxMessage');
  }
  this.tokenHash = data.slice(1, 9);
  this.challenge = data.slice(9, 17);
}

AuthChallengeRxMessage.opcode = opcode;

module.exports = AuthChallengeRxMessage;
