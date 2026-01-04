const crc = require('../crc');

const g5Opcode = 0x31;
const g6Opcode = 0x4f;
const g7Opcode = 0x4e;

function GlucoseRxMessage(data) {
  const opcode = data[0];
  let glucoseBytes;

  if ((opcode !== g5Opcode) && (opcode !== g6Opcode) && (opcode !== g7Opcode)) {
    throw new Error('cannot create new GlucoseRxMessage');
  }

  if (((opcode === g5Opcode) || (opcode === g7Opcode)) && (data.length < 16)) {
    throw new Error('cannot create new GlucoseRxMessage');
  } else if ((opcode === g7Opcode) && (data.length < 19)) {
    throw new Error('cannot create new GlucoseRxMessage');
  }

  if (!crc.crcValid(data)) {
    throw new Error('cannot create new GlucoseRxMessage');
  }

  this.status = data.readUInt8(1);

  if (opcode === g7Opcode) {
    this.timestamp = data.readUInt32LE(2);
    this.sequence = data.readUInt32LE(6);
    this.age = data.readUInt16LE(10);

    glucoseBytes = data.readUInt16LE(12);

    this.state = data.readUInt8(14);
    this.trend = data.readInt8(15);

    // eslint-disable-next-line no-bitwise
    this.predictedGlucose = data.readUint16LE(16) & 0x3ff;
    if (this.predictedGlucose === 0x3ff) {
      this.predictedGlucose = -1;
    }
  } else {
    this.sequence = data.readUInt32LE(2);
    this.timestamp = data.readUInt32LE(6);

    glucoseBytes = data.readUInt16LE(10);

    this.state = data.readUInt8(12);
    this.trend = data.readInt8(13);
  }

  // eslint-disable-next-line no-bitwise
  this.glucoseIsDisplayOnly = (glucoseBytes & 0xf000) > 0;

  // eslint-disable-next-line no-bitwise
  this.glucose = glucoseBytes & 0xfff;
}

GlucoseRxMessage.g5Opcode = g5Opcode;
GlucoseRxMessage.g6Opcode = g6Opcode;
GlucoseRxMessage.g7Opcode = g7Opcode;

module.exports = GlucoseRxMessage;
