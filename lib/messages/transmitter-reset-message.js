const crc = require('../crc');

const opcode = 0x42;

function TransmitterResetMessage(startTime) {
  this.data = Buffer.allocUnsafe(9).fill(opcode, 0, 1);
  this.data.writeUInt32LE(startTime, 1);
  this.data.writeUInt32LE(Date.now()/1000, 5);

  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

TransmitterResetMessage.opcode = opcode;

module.exports = TransmitterResetMessage;
