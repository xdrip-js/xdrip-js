const crc = require('../crc');

const opcode = 0x30;

function GlucoseTxMessage() {
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([
    Buffer.from([opcode]),
    crcBuffer
  ]);
}

GlucoseTxMessage.opcode = opcode;

module.exports = GlucoseTxMessage;
