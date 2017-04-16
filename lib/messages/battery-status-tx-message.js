var crc = require('crc');
const opcode = Buffer.allocUnsafe(1).fill(0x22);

function BatteryStatusTxMessage() {
  var check = crc.crc16xmodem(opcode);
  checkBuffer = Buffer.allocUnsafe(2);
  checkBuffer.writeUInt16LE(check);
  this.data = Buffer.concat([opcode, checkBuffer]);
}

module.exports = BatteryStatusTxMessage;
