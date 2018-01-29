const opcode = 0x29;

function SessionStopRxMessage(data) {
  if ((data.length !== 17) || (data[0] !== opcode)) {
    throw new Error('cannot create new SessionStopRxMessage');
  }
  this.status = data.readUInt8(1);
  this.received = data.readUInt8(2);
  this.requestedStopTime = data.readUInt32LE(3);
  this.sessionStopTime = data.readUInt32LE(7);
  this.transmitterTime = data.readUInt32LE(11);
}

SessionStopRxMessage.opcode = opcode;

module.exports = SessionStopRxMessage;
