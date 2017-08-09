const opcode = 0x27;

function SessionStartRxMessage(data) {
  if ((data.length !== 17) || (data[0] !== opcode)) {
    throw new Error('cannot create new SessionStartRxMessage');
  }
  this.status = data.readUInt8(1);
  this.received = data.readUInt8(2);
  this.requestedStartTime = data.readUInt32LE(3);
  this.sessionStartTime = data.readUInt32LE(7);
  this.transmitterTime = data.readUInt32LE(11);
}

SessionStartRxMessage.opcode = opcode;

module.exports = SessionStartRxMessage;
