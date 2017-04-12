var crc = require('crc');

const opcode = 0x31;

function GlucoseRxMessage(data) {
  console.log('creating new GlucoseRxMessage with data ' + data.toString('hex'));
  if ((data.length < 16) || (data[0] != opcode) || !crcValid(data)) {
    throw new Error('cannot create new GlucoseRxMessage');
  }
  this.status = data.readUInt8(1);
  this.sequence = data.readUInt32LE(2);
  this.timestamp = data.readUInt32LE(6);
  
  var glucoseBytes = data.readUInt16LE(10);
  this.glucoseIsDisplayOnly = (glucoseBytes & 0xf000) > 0;
  this.glucose = glucoseBytes & 0xfff;
  this.state = data.readUInt8(12);
  this.trend = data.readInt8(13);
}

function crcValid(data) {
  return crc.crc16xmodem(data.slice(0, 14)).equals(data.slice(-2, 0));
}

module.exports = GlucoseRxMessage;
