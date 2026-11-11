const crc = require('../crc');

const g5Opcode = 0x30;
const g6Opcode = 0x4e;

// G7: the single byte 0x4e with no CRC, as xDrip+ sends it
// (EGlucoseTxMessage(small = true) for a short transmitter id).
function GlucoseTxMessage(g6Transmitter, g7Transmitter = false) {
  if (g7Transmitter) {
    this.data = Buffer.from([g6Opcode]);
    return;
  }

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
