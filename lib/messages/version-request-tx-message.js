const crc = require('../crc');

const opcodes = [0x20, 0x4A, 0x52];

function VersionRequestTxMessage(version) {
  this.data = Buffer.from([opcodes[version]]);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

VersionRequestTxMessage.opcodes = opcodes;

module.exports = VersionRequestTxMessage;
