// context.js
// JavaScript port of jamorham.keks.Context
// Updated to use elliptic's BN for BigInteger operations

const Config = require('./config');
const Util = require('./util');
const Packet = require('./packet');
const curve = require('./curve'); // Provides access to BN via curve.Q.constructor

class Context {
  constructor() {
    this.keyA = null;
    this.KeyB = null;
    this.password = null;
    this.passwordBytes = null;
    this.alice = null;
    this.bob = null;
    this.challenge = null;
    this.savedKey = null;
    this.packet = new Array(4).fill(null); // indices 0 unused, 1–3 for rounds
    this.packet[1] = new Packet();
    this.packet[2] = new Packet();
    this.packet[3] = new Packet();
    this.sequence = 0;

    this.partA = null;
    this.partB = null;
    this.partC = null;
  }

  validateParts() {
    return (
      this.partA != null
      && this.partB != null
      && this.partC != null
      && this.partA.length > 100
      && this.partB.length > 100
      && this.partC.length > 100
    );
  }

  reset() {
    this.savedKey = null;
    this.packet.fill(null);
  }

  resetIfNotReady() {
    this.sequence = 0;
    if (this.savedKey == null && this.getRound3Packet() == null) {
      this.reset();
    }
  }

  getPasswordBytes() {
    if (this.password == null) {
      throw new Error('Password not set');
    }

    if (this.passwordBytes == null) {
      this.passwordBytes = Buffer.from(this.password, 'utf8');

      if (this.password.length === 6) {
        this.passwordBytes = Util.arrayAppend(Config.Get.PREFIX, this.passwordBytes);
      }
    }

    return this.passwordBytes;
  }

  /**
   * Returns password bytes interpreted as unsigned big-endian BigInteger
   * Equivalent to BigIntegers.fromUnsignedByteArray in Java
   */
  getPasswordBigInteger() {
    const bytes = this.getPasswordBytes();

    // elliptic's BN constructor treats byte array as big-endian unsigned
    // Exactly matches BouncyCastle's fromUnsignedByteArray
    return new curve.Q.constructor(bytes, 'be'); // 'be' = big-endian
  }

  getRound1Packet() {
    return this.packet[1];
  }

  getRound2Packet() {
    return this.packet[2];
  }

  getRound3Packet() {
    return this.packet[3];
  }

  // Lombok-style getters/setters
  getPartA() { return this.partA; }

  setPartA(val) { this.partA = val; }

  getPartB() { return this.partB; }

  setPartB(val) { this.partB = val; }

  getPartC() { return this.partC; }

  setPartC(val) { this.partC = val; }
}

module.exports = Context;
