const crc = require('../crc');

const opcode = 0x43;

function ResetRxMessage(data) {
  if ((data.length !== 16) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new ResetRxMessage');
  }
  this.status = data.readUInt8(1);
}

ResetRxMessage.opcode = opcode;

module.exports = ResetRxMessage;
