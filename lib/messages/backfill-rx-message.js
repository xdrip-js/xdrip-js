const crc = require('../crc');

const opcode = 0x51;

function BackfillRxMessage(data) {
  if ((data.length !== 20) || (data[0] != opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new BackfillRxMessage');
  }
  this.status = data.readUInt8(1);
  this.unknown1 = data.readUInt8(2); // seen 1 or 2 (could mean data was returned?)
  this.unknown2 = data.readUInt8(3); // seen 0, 1 or 2 (don't know)
  this.timestampStart = data.readUInt32LE(4);
  this.timestampEnd = data.readUInt32LE(8);
}

BackfillRxMessage.opcode = opcode;

module.exports = BackfillRxMessage;
