const crc = require('../crc');

const opcode = 0xd0;

function D0UnknownMessage(data) {
  if ((data.length !== 4) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new SensorRxMessage');
  }
  this.value1 = data.readUInt8(1);
}

D0UnknownMessage.opcode = opcode;

module.exports = D0UnknownMessage;

// opcode: d0
// value1: 00

// Examples:
// ========
// D0UnknownMessage:   d0002715
//   opcode:           d0
//   value1:           00
