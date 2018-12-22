const crc = require('../crc');

const g5Opcode = 0x30;
const g6Opcode = 0x4e;
let opcode = g5Opcode;

function GlucoseTxMessage(g6Transmitter) {
  if (g6Transmitter) {
    opcode = g6Opcode;
  }

  this.data = Buffer.from([opcode]);
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

GlucoseTxMessage.opcode = opcode;

module.exports = GlucoseTxMessage;
