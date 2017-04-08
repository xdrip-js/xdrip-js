const opcode = 0x3;

function AuthChallengeRxMessage(data) {
  console.log('creating new AuthChallengeRxMessage with data ' + data.toString('hex'));
  if ((data.length < 17) || (data[0] != opcode)) {
    throw new Error('cannot create new AuthChallengeRxMessage');
  }
  this.tokenHash = data.slice(1, 8); // not sure how to do this
  this.challenge = data.slice(9, 16); // not sure how to do this
}

module.exports = AuthChallengeRxMessage;
