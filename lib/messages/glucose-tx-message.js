const crc = require('../crc');

const g5Opcode = 0x30;
const g6Opcode = 0x4e;

function GlucoseTxMessage(g6Transmitter) {
  let opcode = g5Opcode;

  if (g6Transmitter) {
    opcode = g6Opcode;
  }

  this.data = Buffer.from([opcode]);
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

GlucoseTxMessage.g5Opcode = g5Opcode;
GlucoseTxMessage.g6Opcode = g6Opcode;

module.exports = GlucoseTxMessage;
