const crc = require('../../crc');

const opcode = 0x33;

function CalibrationDataRxMessage(data) {
  if ((data.length !== 19) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new CalibrationDataRxMessage');
  }

  // TODO: work out what bytes 2 - 10 are
  // time since last cal? success? something else?

  this.glucose = data.readUInt16LE(11);
  this.timestamp = data.readUInt32LE(13);
}

CalibrationDataRxMessage.opcode = opcode;

module.exports = CalibrationDataRxMessage;

// 3300282e0090012e00fe004d00df8402002c9b
//
// opcode:    0x33
// unknown:   0x00282e0090012e00fe
// glucose:   100 (0x004d)
// timestamp: 14648322 (00df8402)
