// sign-challenge-tx-message.js
// JavaScript port of jamorham.keks.message.SignChallengeTxMessage

const Util = require('./util'); // For getRandomKey()

class SignChallengeTxMessage {
  /**
   * Constructor with explicit challenge
   * @param {Buffer} challenge - 16-byte challenge hash
   */
  constructor(challenge) {
    if (!Buffer.isBuffer(challenge) || challenge.length !== 16) {
      throw new Error('challenge must be a 16-byte Buffer');
    }

    this.challengeHash = challenge;

    // Build the 17-byte sequence: opcode + 16-byte challenge
    this.byteSequence = Buffer.concat([
      Buffer.from([SignChallengeTxMessage.opcode]),
      this.challengeHash,
    ]);
  }

  /**
   * Parameterless constructor — uses random challenge (mirrors Java default)
   * @returns {SignChallengeTxMessage}
   */
  static createDefault() {
    const randomChallenge = Util.getRandomKey(); // 16 bytes
    return new SignChallengeTxMessage(randomChallenge);
  }

  getChallengeHash() {
    return this.challengeHash;
  }
}

SignChallengeTxMessage.opcode = 0x0c;

module.exports = SignChallengeTxMessage;
