/* eslint-disable no-bitwise */

class ExtraState {
  /**
   * Creates a new ExtraState instance
   * @param {boolean} p - bit 0
   * @param {boolean} t - bit 1
   * @param {boolean} l - bit 2
   * @param {boolean} h - bit 3
   * @param {boolean} s - bit 4
   * @param {boolean} error - bit 7
   */
  constructor(p = false, t = false, l = false, h = false, s = false, error = false) {
    this.p = p;
    this.t = t;
    this.l = l;
    this.h = h;
    this.s = s;
    this.error = error;
  }

  /**
   * Parses a byte (number 0–255) into an ExtraState object
   * Matches the Java parse(byte state) method exactly
   * @param {number} state - The byte value (will be masked to 8 bits)
   * @returns {ExtraState}
   */
  static parseByte(state) {
    const byte = state & 0xFF; // ensure only lower 8 bits

    return new ExtraState(
      (byte & 0x01) !== 0, // p
      (byte & 0x02) !== 0, // t
      (byte & 0x04) !== 0, // l
      (byte & 0x08) !== 0, // h
      (byte & 0x10) !== 0, // s
      (byte & 0x80) !== 0, // error
    );
  }

  /**
   * Parses an int (or any number) by casting to byte
   * Matches the Java parse(int state) overload
   * @param {number} state
   * @returns {ExtraState}
   */
  static parse(state) {
    return ExtraState.parseByte(state);
  }

  /**
   * Optional: pretty-print for debugging
   * @returns {string}
   */
  toString() {
    return `ExtraState{p=${this.p}, t=${this.t}, l=${this.l}, h=${this.h}, s=${this.s}, error=${this.error}}`;
  }

  /**
   * Optional: convert back to byte value
   * @returns {number}
   */
  toByte() {
    let byte = 0;
    if (this.p) byte |= 0x01;
    if (this.t) byte |= 0x02;
    if (this.l) byte |= 0x04;
    if (this.h) byte |= 0x08;
    if (this.s) byte |= 0x10;
    if (this.error) byte |= 0x80;
    return byte;
  }
}

module.exports = ExtraState;
