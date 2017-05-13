const crc = require('../crc');

const opcode = 0x24;

function TransmitterTimeTxMessage() {
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([Buffer.from(opcode), crcBuffer]);
}

TransmitterTimeTxMessage.opcode = opcode;

module.exports = TransmitterTimeTxMessage;
