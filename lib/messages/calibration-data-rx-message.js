const crc = require('../crc');

const opcode = 0x33;

function CalibrationDataRxMessage(data) {
  if ((data.length != 19) || (data[0] != opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new CalibrationDataRxMessage');
  }

  // the following is a guess
  const glucoseBytes = data.readUInt16LE(11);
  this.glucoseIsDisplayOnly = (glucoseBytes & 0xf000) > 0;
  this.glucose = glucoseBytes & 0xfff;
  this.timestamp = data.readUInt32LE(13)
}

module.exports = CalibrationDataRxMessage;
