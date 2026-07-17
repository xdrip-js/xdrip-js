// auth-request-tx-message2.js
// JavaScript port of jamorham.keks.message.AuthRequestTxMessage2

const Util = require('../keks_plugin/util'); // For getRandomKey()

class AuthRequestTxMessage2 {
  /**
   * @param {number} token_size - Size of the random single-use token (typically 8)
   */
  constructor(tokenSize) {
    // Java overload: AuthRequestTxMessage2(int tokenSize)
    // Calls the full constructor with alt = false and empty chal
    this.init(tokenSize, false);
  }

  static create(tokenSize, alt = false, chal = Buffer.alloc(0)) {
    const msg = new AuthRequestTxMessage2(tokenSize); // uses simple constructor internally
    // Re-run init with full parameters
    msg.init(tokenSize, alt, chal);
    return msg;
  }

  /**
   * Full constructor matching Java
   * @param {number} tokenSize
   * @param {boolean} alt - If true, uses endByteAlt (0x01), else endByteStd (0x02)
   * @param {Buffer} chal - Challenge bytes (used only if length > 2 to take chal[2])
   */
  init(tokenSize, alt = false, chal = Buffer.alloc(0)) {
    let slot = alt ? AuthRequestTxMessage2.endByteAlt : AuthRequestTxMessage2.endByteStd;

    if (chal.length > 2) {
      slot += chal[2]; // Java: chal[2] added to end byte
    }

    // Generate random token
    const randomKey = Util.getRandomKey(); // 16 bytes from crypto.randomBytes(16)
    this.singleUseToken = randomKey.slice(0, tokenSize); // Take first tokenSize bytes

    // Build the full message: opcode + token + slot byte
    this.byteSequence = Buffer.concat([
      Buffer.from([AuthRequestTxMessage2.opcode]),
      this.singleUseToken,
      Buffer.from([slot]),
    ]);
  }

  /**
   * Alternative constructor matching: AuthRequestTxMessage2(int tokenSize, int slot)
   * @param {number} tokenSize
   * @param {number} slot
   */
  static withSlot(tokenSize, slot) {
    const msg = new AuthRequestTxMessage2(tokenSize); // Start with default
    // Override the last byte (slot)
    msg.byteSequence[msg.byteSequence.length - 1] = slot;
    // Also update singleUseToken if needed (though not in Java — but safe)
    return msg;
  }
}

AuthRequestTxMessage2.opcode = 0x02;
AuthRequestTxMessage2.endByteStd = 0x02;
AuthRequestTxMessage2.endByteAlt = 0x01;

module.exports = AuthRequestTxMessage2;
