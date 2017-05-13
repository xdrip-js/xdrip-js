const opcode = 0x27;

function SessionStartRxMessage(data) {
  if ((data.length !== 1) || (data[0] != opcode)) {
    // TODO: find out how long a SessionStartRxMessage is,
    // and what info it contains
    throw new Error('cannot create new SessionStartRxMessage');
  }
}

SessionStartRxMessage.opcode = opcode;

module.exports = SessionStartRxMessage;
