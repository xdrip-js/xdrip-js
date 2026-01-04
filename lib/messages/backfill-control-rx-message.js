const crc = require('../crc');

const opcode = 0x59;

function BackfillControlRxMessage(data) {
  if (!crc.crcValid(data)) {
    throw new Error('cannot create new BackfillRxMessage');
  }

  // TODO: Parse this message!
}

BackfillControlRxMessage.opcode = opcode;

module.exports = BackfillControlRxMessage;
