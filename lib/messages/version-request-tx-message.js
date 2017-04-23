const crc = require('../crc');
const opcode = Buffer.allocUnsafe(1).fill(0x4a);

function VersionRequestTxMessage() {
  const messageCRC = Buffer.allocUnsafe(2);
  messageCRC.writeUInt16LE(crc.crc16(opcode));
  this.data = Buffer.concat([opcode, messageCRC]);
}

module.exports = VersionRequestTxMessage;
