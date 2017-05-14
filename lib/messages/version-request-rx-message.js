const crc = require('../crc');

const opcode = 0x4b;

function VersionRequestRxMessage(data) {
  console.log('creating new VersionRequestRxMessage with data ' + data.toString('hex'));
  if ((data.length != 19) || (data[0] != opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new VersionRequestRxMessage');
  }

  // TODO: extract version from messages as per comment below
}

VersionRequestRxMessage.opcode = opcode;

module.exports = VersionRequestRxMessage;

// 4b000100040adf2900002800037000f0006e35
//
// opcode:            0x4b
// status:            0x00
// version:           1.0.4.10 (0x0100040a)
// BT version:        223.41.0.0 (0xdf290000)
// H/W rev:           40 (0x28)
// other F/W version: 0.3.112 (0x000370)
// asic:              0x00f0
