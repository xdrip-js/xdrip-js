var crc = require('../crc');

const opcode = 0x25;

function TransmitterTimeRxMessage(data) {
  console.log('creating new TransmitterTimeRxMessage with data ' + data.toString('hex'));
  if ((data.length != 16) || (data[0] != opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new TransmitterTimeRxMessage');
  }
  this.status = data.readUInt8(1);
  this.currentTime = data.readUInt32LE(2);
  this.sessionStartTime = data.readUInt32LE(6);
}

module.exports = TransmitterTimeRxMessage;
