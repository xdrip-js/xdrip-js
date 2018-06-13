const crc = require('../crc');

const g5_opcode = 0x30;
const g6_opcode = 0x4e;
let opcode = g5_opcode;

function GlucoseTxMessage(g6_transmitter) {

  if (g6_transmitter) {
	opcode = g6_opcode
  }

  this.data = Buffer.from([opcode]);
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}


GlucoseTxMessage.opcode = opcode;

module.exports = GlucoseTxMessage;
