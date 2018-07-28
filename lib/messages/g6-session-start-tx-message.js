const crc = require('../crc');
const G6CalibrationParameters = require('./g6-calibration-parameters');           

const opcode = 0x26;

function G6SessionStartTxMessage(startTime, sensorSerialCode) {
  this.params = new G6CalibrationParameters(sensorSerialCode)
  this.data = Buffer.allocUnsafe(9).fill(opcode, 0, 1);
  this.data.writeUInt32LE(startTime, 1);
  this.data.writeUInt32LE(Date.now()/1000, 5);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

G6SessionStartTxMessage.opcode = opcode;

module.exports = G6SessionStartTxMessage;

