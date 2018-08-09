const crc = require('crc');

const opcode = Buffer.allocUnsafe(1).fill(0x22);

function BatteryStatusTxMessage() {
  const check = crc.crc16xmodem(opcode);
  const checkBuffer = Buffer.allocUnsafe(2);
  checkBuffer.writeUInt16LE(check);
  this.data = Buffer.concat([opcode, checkBuffer]);
}

module.exports = BatteryStatusTxMessage;
