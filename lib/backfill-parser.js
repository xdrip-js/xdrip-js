function BackfillParser() {
  this.expectedMessageIndex = 1;
}

BackfillParser.prototype.parse = (message) => {
  if (message[0] !== this.expectedMessageIndex) {
    throw new Error(`unexpected index: expecting ${this.expectedMessageIndex}, got ${message[0]}`);
  }
  if (message[1] !== 0x80) {
    throw new Error('got something other than 0x80');
  }
  this.expectedMessageIndex += 1;
  // TODO: implement
};

module.exports = BackfillParser;
