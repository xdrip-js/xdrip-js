const crc = require('../crc');

const opcode = 0x30;

function GlucoseTxMessage() {
  this.data = Buffer.from([opcode]);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

GlucoseTxMessage.opcode = opcode;

module.exports = GlucoseTxMessage;
