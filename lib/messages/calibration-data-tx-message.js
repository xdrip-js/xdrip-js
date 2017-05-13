const crc = require('../crc');

const opcode = 0x32;

function CalibrationDataTxMessage() {
  // TODO: I'm assuming that this message is just opcode + crc
  // as there's no data to transmitter
  // need to confirm if this is true
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([Buffer.from([opcode]), crcBuffer]);
}

CalibrationDataTxMessage.opcode = opcode;

module.exports = CalibrationDataTxMessage;
