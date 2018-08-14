const crc = require('../../crc');
const CalibrationParameters = require('./calibration-parameters');

const opcode = 0x26;

function SessionStartTxMessage(startTime, sensorSerialCode) {
  this.params = new CalibrationParameters(sensorSerialCode);

  this.data = Buffer.allocUnsafe(9).fill(opcode, 0, 1);
  this.data.writeUInt32LE(startTime, 1);
  this.data.writeUInt32LE(Date.now() / 1000, 5);

  if (!this.params.isNullCode() && this.params.isValid()) {
    const codeBuffer = Buffer.allocUnsafe(4);
    codeBuffer.writeUInt16LE(this.data.params.paramA);
    codeBuffer.writeUInt16LE(this.data.params.paramB, 2);
    this.data = Buffer.concat([this.data, codeBuffer]);
  }

  const nullBuffer = Buffer.allocUnsafe(2).fill(0x0000);
  nullBuffer.writeUInt16LE(nullBuffer);
  this.data = Buffer.concat([this.data, nullBuffer]);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

SessionStartTxMessage.opcode = opcode;

module.exports = SessionStartTxMessage;
