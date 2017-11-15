function BackfillParser(callback) {
  this.expectedMessageIndex = 1;
}

BackfillParser.prototype.parse = function(message) {
  if (message[0] !== this.expectedMessageIndex++) {
    throw new Error(
      'unexpected message index: expecting ' +
      this.expectedMessageIndex +
      ', got ' + message[0]
    );
  }
  if (message[1] !== 0x80) {
    throw new Error('got something other than 0x80');
  }
  // TODO: implement
};

module.exports = BackfillParser;
