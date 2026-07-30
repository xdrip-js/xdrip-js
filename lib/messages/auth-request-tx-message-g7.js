// auth-request-tx-message2.js
// JavaScript port of jamorham.keks.message.AuthRequestTxMessage2

const Util = require('../keks_plugin/util'); // For getRandomKey()

class AuthRequestTxMessageG7 {
  /**
   * @param {number} token_size - Size of the random single-use token (typically 8)
   */
  constructor(tokenSize) {
    // Java overload: AuthRequestTxMessageG7(int tokenSize)
    // Calls the full constructor with alt = false and empty chal
    this.init(tokenSize);
  }

  static create(tokenSize, alt = false, chal = Buffer.alloc(0)) {
    const msg = new AuthRequestTxMessageG7(tokenSize); // uses simple constructor internally
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
    let slot = alt ? AuthRequestTxMessageG7.endByteAlt : AuthRequestTxMessageG7.endByteStd;

    if (chal.length > 2) {
      slot += chal[2]; // Java: chal[2] added to end byte
    }

    // Generate random token
    const randomKey = Util.getRandomKey(); // 16 bytes from crypto.randomBytes(16)
    this.singleUseToken = randomKey.slice(0, tokenSize); // Take first tokenSize bytes

    // Build the full message: opcode + token + slot byte
    this.byteSequence = Buffer.concat([
      Buffer.from([AuthRequestTxMessageG7.opcode]),
      this.singleUseToken,
      Buffer.from([slot]),
    ]);
  }

  /**
   * Alternative constructor matching: AuthRequestTxMessageG7(int tokenSize, int slot)
   * @param {number} tokenSize
   * @param {number} slot
   */
  static withSlot(tokenSize, slot) {
    const msg = new AuthRequestTxMessageG7(tokenSize); // Start with default
    // Override the last byte (slot)
    msg.byteSequence[msg.byteSequence.length - 1] = slot;
    // Also update singleUseToken if needed (though not in Java — but safe)
    return msg;
  }
}

AuthRequestTxMessageG7.opcode = 0x02;
AuthRequestTxMessageG7.endByteStd = 0x02;
AuthRequestTxMessageG7.endByteAlt = 0x01;

module.exports = AuthRequestTxMessageG7;
