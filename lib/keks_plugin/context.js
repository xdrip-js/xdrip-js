// context.js
// JavaScript port of jamorham.keks.Context
// Updated to use elliptic's BN for B  igInteger operations

const debug = require('debug')('keks-plugin:debug');
const BN = require('bn.js');
const Config = require('./config');
const Util = require('./util');

class Context {
  constructor() {
    this.keyA = null;
    this.keyB = null;
    this.password = null;
    this.passwordBytes = null;
    this.alice = null;
    this.bob = null;
    this.challenge = null;
    this.savedKey = null;
    this.packet = new Array(4).fill(null); // indices 0 unused, 1–3 for rounds
    this.sequence = 0;
    this.role = null;

    [this.partA, this.partB, this.partC] = Config.KEKS;
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
    debug('resetting context');

    this.challenge = null;
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
    const bn = new BN(Buffer.from(bytes));

    return bn;
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
