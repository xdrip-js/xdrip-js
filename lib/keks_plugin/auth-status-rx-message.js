// auth-status-rx-message.js
// JavaScript port of jamorham.keks.message.AuthStatusRxMessage

class AuthStatusRxMessage {
  /**
   * @param {Buffer} packet - Raw received packet
   */
  constructor(packet) {
    this.authenticated = 0;
    this.bonded = 0;

    if (Buffer.isBuffer(packet) && packet.length >= 3 && packet[0] === AuthStatusRxMessage.opcode) {
      const [, authenticated, bonded] = packet;

      this.authenticated = authenticated;
      this.bonded = bonded;
    }
  }

  isAuthenticated() {
    return this.authenticated === 1;
  }

  isBonded() {
    return this.bonded === 1;
  }

  needsRefresh() {
    return this.bonded === 3;
  }
}

AuthStatusRxMessage.opcode = 0x05;

module.exports = AuthStatusRxMessage;
