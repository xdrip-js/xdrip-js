const crc = require('../crc');

const opcode = 0x53;

function VersionRequestRx2Message(data) {
  if (data.length !== 19) {
    throw new Error(`cannot create new VersionRequestRx2Message - invalid length = ${data.length}`);
  } else if (data[0] !== opcode) {
    throw new Error(`cannot create new VersionRequestRx2Message - invalid opcode = ${data[0]}`);
  } else if (!crc.crcValid(data)) {
    throw new Error('cannot create new VersionRequestRx2Message - invalid CRC');
  }

  this.status = data.readUInt8(1);
  this.typicalSensorDays = data.readUInt8(2);
  this.featureBits = data.readUInt16LE(3);
  // 12 more bytes of unkonwn data
}

VersionRequestRx2Message.opcode = opcode;

module.exports = VersionRequestRx2Message;

// 4b000100040adf2900002800037000f0006e35
//
// opcode:            0x4b
// status:            0x00
// version:           1.0.4.10 (0x0100040a)
// build:
// H/W rev:           40 (0x28)
// other F/W version: 0.3.112 (0x000370)
// asic:              0x00f0

// 4b000100040adf2900004800037000f0007486
//
// opcode:            4b
// status:            00
// version:           0100040a
// BT version:        df290000
// H/W rev:           48
// other F/W version: 000370
// asic:              00f0007486
