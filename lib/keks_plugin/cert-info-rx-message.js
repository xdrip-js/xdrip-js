// cert-info-rx-message.js
// JavaScript port of jamorham.keks.message.CertInfoRxMessage

class CertInfoRxMessage {
  /**
   * @param {Buffer} packet - Raw 7-byte received packet
   */
  constructor(packet) {
    this.size = -1;
    this.which = -1;
    this.state = 0;

    if (Buffer.isBuffer(packet) && packet.length === 7 && packet[0] === CertInfoRxMessage.opcode) {
      // Little-endian parsing (Java ByteBuffer.order(LITTLE_ENDIAN))
      const [, state, which] = packet;
      this.state = state;
      this.which = which;

      // Size is 4 bytes little-endian (starting at index 3)
      this.size = packet.readUInt32LE(3);
    }
  }

  valid() {
    return this.size > 0 && this.state === 0 && this.which >= 0;
  }

  getSize() {
    return this.size;
  }

  getWhich() {
    return this.which;
  }

  getState() {
    return this.state;
  }
}

CertInfoRxMessage.opcode = 0x0b;

module.exports = CertInfoRxMessage;
