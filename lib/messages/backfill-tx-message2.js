const crc = require('../crc');

const opcode = 0x59;

function BackfillTxMessage2(timestampStart, timestampEnd) {
  this.data = Buffer.allocUnsafe(9).fill(opcode, 0, 1);
  this.data.writeUInt32LE(timestampStart, 1);
  this.data.writeUInt32LE(timestampEnd, 5);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

BackfillTxMessage2.opcode = opcode;

module.exports = BackfillTxMessage2;

// NOTE: this is a total guess
// +--------+--------------------------+------------------------+--------+
// | [0]    | [1-4]                    | [5-8]                  | [9-10] |
// +--------+--------------------------+------------------------+--------+
// | opcode | dexcomStartTimeInSeconds | dexcomEndTimeInSeconds | CRC    |
// +--------+--------------------------+------------------------+--------+
// | 50     | 9e 32 66 00              | ce 5c 66 00            | 87 77  |
// +--------+--------------------------+------------------------+--------+
