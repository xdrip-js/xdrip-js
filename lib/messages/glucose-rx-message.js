const crc = require('../crc');

var opcode = 0x31;

function GlucoseRxMessage(data, id) {
  f2 = id.substr(0,2);
  // if serial number starts with 80xxxx or 81xxxx then assume g6 and use g6 GlucoseRx opcode = 0x4f
  if (f2 == "80" || f2 == "81") {
        opcode = 0x4f;
  }

  if ((data.length < 16) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new GlucoseRxMessage');
  }
  this.status = data.readUInt8(1);
  this.sequence = data.readUInt32LE(2);
  this.timestamp = data.readUInt32LE(6);

  const glucoseBytes = data.readUInt16LE(10);
  this.glucoseIsDisplayOnly = (glucoseBytes & 0xf000) > 0;
  this.glucose = glucoseBytes & 0xfff;
  this.state = data.readUInt8(12);
  this.trend = data.readInt8(13);
}

GlucoseRxMessage.opcode = opcode;

module.exports = GlucoseRxMessage;
