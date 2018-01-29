const crc = require('../crc');

const opcode = 0x32;

function CalibrationDataTxMessage() {
  this.data = Buffer.from([opcode]);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

CalibrationDataTxMessage.opcode = opcode;

module.exports = CalibrationDataTxMessage;
