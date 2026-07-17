// cert-info-tx-message.js
// JavaScript port of jamorham.keks.message.CertInfoTxMessage

class CertInfoTxMessage {
  /**
   * Private helper to build the "expect my cert" command
   * @param {Plugin} plugin - The KEKS plugin instance
   * @param {number} which - 0 for partA, 1 for partB
   * @returns {Buffer} 6-byte command
   */
  static expectMyCert(plugin, which) {
    if (![0, 1].includes(which)) {
      throw new Error('which must be 0 or 1');
    }

    const { context } = plugin;
    const part = which === 0 ? context.getPartA() : context.getPartB();

    const length = part ? part.length : 0;

    // Build: opcode (1) + which (1) + length int BE (4) = 6 bytes
    const buffer = Buffer.alloc(6);
    buffer[0] = CertInfoTxMessage.opcode;
    buffer[1] = which;
    buffer.writeUInt32LE(length, 2); // big-endian

    return buffer;
  }

  /**
   * Request certificate part 1 (partA)
   * @param {Plugin} plugin
   * @returns {Buffer}
   */
  static expectMyCert1(plugin) {
    return this.expectMyCert(plugin, 0);
  }

  /**
   * Request certificate part 2 (partB)
   * @param {Plugin} plugin
   * @returns {Buffer}
   */
  static expectMyCert2(plugin) {
    return this.expectMyCert(plugin, 1);
  }
}

CertInfoTxMessage.opcode = 0x0b;

module.exports = CertInfoTxMessage;
