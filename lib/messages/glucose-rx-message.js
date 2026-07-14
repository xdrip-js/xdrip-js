const crc = require('../crc');

const g5Opcode = 0x31;
const g6Opcode = 0x4f;
const g7Opcode = 0x4e;

class GlucoseRxMessage {
  constructor(data) {
    const opcode = data[0];
    let glucoseBytes;
    let offset;

    if ((opcode !== g5Opcode) && (opcode !== g6Opcode) && (opcode !== g7Opcode)) {
      throw new Error(`cannot create new GlucoseRxMessage - invalid opcode ${opcode}`);
    }

    if (((opcode === g5Opcode) || (opcode === g7Opcode)) && (data.length < 16)) {
      throw new Error(`cannot create new GlucoseRxMessage - invalid length ${data.length}`);
    } else if ((opcode === g7Opcode) && (data.length < 19)) {
      throw new Error(`cannot create new GlucoseRxMessage - invalid length ${data.length} for G7`);
    }

    if ((opcode !== g7Opcode) && !crc.crcValid(data)) {
      throw new Error('cannot create new GlucoseRxMessage - invalid CRC');
    }

    offset = 1;

    this.status = data.readUInt8(offset);
    offset += 1;

    if (opcode === g7Opcode) {
      this.timestamp = data.readUInt32LE(offset);
      offset += 4;

      this.sequence = data.readUInt16LE(offset);
      offset += 2;

      // let unknown = data.readUInt16(offset);
      offset += 2;

      this.age = data.readUInt16LE(offset);
      offset += 2;

      glucoseBytes = data.readUInt16LE(offset);
      offset += 2;

      this.state = data.readUInt8(offset);
      offset += 1;

      this.trend = data.readInt8(offset);
      offset += 1;

      // eslint-disable-next-line no-bitwise
      this.predictedGlucose = data.readUint16LE(offset) & 0x3ff;
      offset += 2;

      if (this.predictedGlucose === 0x3ff) {
        this.predictedGlucose = -1;
      }
    } else {
      this.sequence = data.readUInt32LE(offset);
      offset += 4;

      this.timestamp = data.readUInt32LE(offset);
      offset += 4;

      glucoseBytes = data.readUInt16LE(offset);
      offset += 2;

      this.state = data.readUInt8(offset);
      offset += 1;

      this.trend = data.readInt8(offset);
      offset += 1;
    }

    // eslint-disable-next-line no-bitwise
    this.glucoseIsDisplayOnly = (glucoseBytes & 0xf000) > 0;

    // eslint-disable-next-line no-bitwise
    this.glucose = glucoseBytes & 0xfff;
  }
}

GlucoseRxMessage.g5Opcode = g5Opcode;
GlucoseRxMessage.g6Opcode = g6Opcode;
GlucoseRxMessage.g7Opcode = g7Opcode;

module.exports = GlucoseRxMessage;
