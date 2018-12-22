const crc = require('../crc');

const g5Opcode = 0x31;
const g6Opcode = 0x4f;
let opcode = g5Opcode;

function GlucoseRxMessage(data, g6Transmitter) {
  if (g6Transmitter) {
    opcode = g6Opcode;
  }

  if ((data.length < 16) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new GlucoseRxMessage');
  }
  this.status = data.readUInt8(1);
  this.sequence = data.readUInt32LE(2);
  this.timestamp = data.readUInt32LE(6);

  const glucoseBytes = data.readUInt16LE(10);
  // eslint-disable-next-line no-bitwise
  this.glucoseIsDisplayOnly = (glucoseBytes & 0xf000) > 0;
  // eslint-disable-next-line no-bitwise
  this.glucose = glucoseBytes & 0xfff;
  this.state = data.readUInt8(12);
  this.trend = data.readInt8(13);
}

GlucoseRxMessage.opcode = opcode;

module.exports = GlucoseRxMessage;
