const crc = require('../crc');
const opcode = Buffer.allocUnsafe(1).fill(0x34);

function CalibrationTxMessage(glucose, timestamp) {
  glucoseBuffer = Buffer.allocUnsafe(2);
  glucoseBuffer.writeUInt16LE(glucose);
  timestampBuffer = Buffer.allocUnsafe(4);
  timestampBuffer.writeUInt32LE(timestamp);
  this.data = Buffer.concat([opcode, glucoseBuffer, timestampBuffer]);
  const check = crc.crc16(this.data);
  checkBuffer = Buffer.allocUnsafe(2);
  checkBuffer.writeUInt16LE(check);
  this.data = Buffer.concat([this.data, checkBuffer]);
  console.log('created calibration message with: ' + this.data.toString('hex'));
}

module.exports = CalibrationTxMessage;


  // +--------+---------+----------------------+-------+
  // | [0]    | [1-2]   | [3-6]                | [7-8] |
  // +--------+---------+----------------------+-------+
  // | opcode | glucose | dexcomTimeInSeconds  | CRC   |
  // +--------+---------+----------------------+-------+
  // | 34     | cb 00   | 35 20 00 00          | b3 f3 |
  // +--------+---------+----------------------+-------+
