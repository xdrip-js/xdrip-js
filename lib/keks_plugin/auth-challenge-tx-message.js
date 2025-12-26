// auth-challenge-tx-message.js
// JavaScript port of jamorham.keks.message.AuthChallengeTxMessage

class AuthChallengeTxMessage {
  /**
   * @param {Buffer} challenge - 8-byte challenge hash (from Calc.calculateHash)
   */
  constructor(challenge) {
    if (!Buffer.isBuffer(challenge) || challenge.length !== 8) {
      throw new Error('challenge must be an 8-byte Buffer');
    }

    this.challengeHash = challenge;

    // Build the 9-byte sequence: opcode + 8-byte hash
    this.byteSequence = Buffer.concat([
      Buffer.from([AuthChallengeTxMessage.opcode]),
      this.challengeHash,
    ]);
  }
}

AuthChallengeTxMessage.opcode = 0x04;

module.exports = AuthChallengeTxMessage;
