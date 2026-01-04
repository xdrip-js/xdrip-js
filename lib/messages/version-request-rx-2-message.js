const crc = require('../crc');

const opcode = 0x53;
const opcode2 = 0x52;

function VersionRequestRx2Message(data) {
  if (data.length < 9) {
    throw new Error(`cannot create new VersionRequestRx2Message - invalid length = ${data.length}`);
  } else if (data[0] !== opcode && data[0] !== opcode2) {
    throw new Error(`cannot create new VersionRequestRx2Message - invalid opcode = ${data[0]}`);
  } else if (!crc.crcValid(data)) {
    throw new Error('cannot create new VersionRequestRx2Message - invalid CRC');
  }

  this.status = data.readUInt8(1);

  if (data[0] === opcode) {
    this.typicalSensorDays = data.readUInt8(2);
    this.featureBits = data.readUInt16LE(3);
    // 12 more bytes of unkonwn data
  } else {
    this.lifeSeconds = data.readUInt32LE(3);
    this.warmupSeconds = data.readUInt16LE(7);
    this.version1 = data.readUInt32LE(9);
    this.version2 = data.readUInt8(13);
    this.typicalSensorDays = data.readUInt16LE(14);
    this.typicalSensorDays = Math.min(this.typicalSensorDays, this.lifeSeconds / 86400);
  }
}

VersionRequestRx2Message.opcode = opcode;

module.exports = VersionRequestRx2Message;

// 53000a0f0000000000303235302d50726f771a
//
// opcode:              0x53
// status:              0x00
// Typical Sensor Days: 10 (0x0a)
// featureBits:         0x0f
