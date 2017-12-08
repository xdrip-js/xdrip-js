const crc = require('../crc');

const opcode = 0x2f;

function SensorRxMessage(data) {
  if ((data.length !== 16) || (data[0] !== opcode) || !crc.crcValid(data)) {
    throw new Error('cannot create new SensorRxMessage');
  }
  this.status = data.readUInt8(1);
  this.timestamp = data.readUInt32LE(2);
  this.unfiltered = data.readUInt32LE(6);
  this.filtered = data.readUInt32LE(10);
}

SensorRxMessage.opcode = opcode;

module.exports = SensorRxMessage;

e0a80300 (239)
e08a0300 ()

c0080400 (264)
40b20300 (242)

2f0058535200c008040040b203000393
// opcode: 2f
// status: 00
// currentTime: bea45100
// unfiltered: 40960300 (235 = 13)
// filtered: (219 = 12.2)
// e653

// Examples:
// ========
// TransmitterTimeRxMessage:   2500844db500ffffffff010000006e11
//   opcode:           25
//   status:           00
//   currentTime:      844db500
//   sessionStartTime: ffffffff
//   unknown:          01000000
//   opcode:           6e11
// GlucoseRxMessage:           310000000000804db5000100017f6e98
//   opcode:           31
//   status:           00
//   sequence:         00000000
//   timestamp:        804db500
//   glucose           0100
//   state:            01
//   trend:            7f
//   opcode:           6e98
// SensorRxMessage:            2f00804db500805f0900005f0900f355
//   opcode:           2f
//   status:           00
//   timestamp:        804db500
//   unfiltered:       805f0900
//   filtered:         005f0900
//   opcode:           f355
