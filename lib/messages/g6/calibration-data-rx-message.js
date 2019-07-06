const crc = require('../crc');

const opcode = 0x33;

// the g6 transmitter data length for the calibration rx messsage is 20 bytes (g5 is 19)
function CalibrationDataRxMessage(data) {
  if ((data.length !== 20) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new CalibrationDataRxMessage');
  }

  // TODO: work out what bytes 2 - 10 are
  // time since last cal? success? something else?

  this.glucose = data.readUInt16LE(11);
  this.timestamp = data.readUInt32LE(13);
}

CalibrationDataRxMessage.opcode = opcode;

module.exports = CalibrationDataRxMessage;
