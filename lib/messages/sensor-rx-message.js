const crc = require('../crc');

const opcode = 0x2f;

function SensorRxMessage(data) {
  if ((data.length !== 14) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new SensorRxMessage');
  }
  this.status = data.readUInt8(1);
  this.timestamp = data.readUInt32LE(2);
  this.unfiltered = data.readUInt32LE(6);
  this.filtered = data.readUInt32LE(10);
}

SensorRxMessage.opcode = opcode;

module.exports = SensorRxMessage;
