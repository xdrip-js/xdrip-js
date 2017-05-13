const crc = require('../crc');

const opcode = 0x34;

function CalibrateGlucoseTxMessage(glucose, timestamp) {
  this.data = Buffer.allocUnsafe(7).fill(opcode, 0, 1);
  this.data.writeUInt16LE(glucose, 1);
  this.data.writeUInt32LE(timestamp, 3);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

CalibrateGlucoseTxMessage.opcode = opcode;

module.exports = CalibrateGlucoseTxMessage;

// +--------+---------+----------------------+-------+
// | [0]    | [1-2]   | [3-6]                | [7-8] |
// +--------+---------+----------------------+-------+
// | opcode | glucose | dexcomTimeInSeconds  | CRC   |
// +--------+---------+----------------------+-------+
// | 34     | cb 00   | 35 20 00 00          | b3 f3 |
// +--------+---------+----------------------+-------+
