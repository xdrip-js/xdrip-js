const crc = require('../crc');
const opcode = Buffer.allocUnsafe(1).fill(0x26);

function SessionStartTxMessage(startTime) {
  startTimeBuffer = Buffer.allocUnsafe(4);
  startTimeBuffer.writeUInt32LE(startTime);
  utcTimeBuffer = Buffer.allocUnsafe(4);
  utcTimeBuffer.writeUInt32LE(Date.now()/1000);
  this.data = Buffer.concat([opcode, startTimeBuffer, utcTimeBuffer]);
  const check = crc.crc16(this.data);
  checkBuffer = Buffer.allocUnsafe(2);
  checkBuffer.writeUInt16LE(check);
  this.data = Buffer.concat([this.data, checkBuffer]);
  console.log('created session start message with: ' + this.data.toString('hex'));
}

module.exports = SessionStartTxMessage;


//   console.log('6. on read, expect auth-status-rx-message, check authenticated and bonded');
//   console.log('read ' + data.toString('hex') + ' after ' + Profiling.now() + ' seconds.');
