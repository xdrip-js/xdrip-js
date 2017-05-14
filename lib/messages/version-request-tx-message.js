const crc = require('../crc');

const opcode = 0x4a;

function VersionRequestTxMessage() {
  this.data = Buffer.from([opcode]);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

VersionRequestTxMessage.opcode = opcode;

module.exports = VersionRequestTxMessage;
