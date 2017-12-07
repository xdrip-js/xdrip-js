const crc = require('../crc');

const opcode = 0x28;

function SessionStopTxMessage(stopTime) {
  this.data = Buffer.allocUnsafe(5).fill(opcode, 0, 1);
  this.data.writeUInt32LE(stopTime, 1);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

SessionStopTxMessage.opcode = opcode;

module.exports = SessionStopTxMessage;
