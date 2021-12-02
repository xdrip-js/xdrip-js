const crc = require('../crc');

const opcode = 0x2f;
const g6Scale = 34;

function SensorRxMessage(data, g6Transmitter) {
  if (data.length !== 16 && data.length !== 18 && data.length !== 8) {
    throw new Error(`cannot create new SensorRxMessage: length=${data.length}`);
  }
  if (data[0] !== opcode) {
    throw new Error(`cannot create new SensorRxMessage: opcode=${data[0]}`);
  }
  if (!crc.crcValid(data)) {
    throw new Error('cannot create new SensorRxMessage: invalid CRC');
  }
  this.status = data.readUInt8(1);
  this.timestamp = data.readUInt32LE(2);

  if (data.length > 8) {
    this.unfiltered = data.readUInt32LE(6);
    this.filtered = data.readUInt32LE(10);
    if (g6Transmitter) {
      if (data.length == 18) {
        this.unknown = data.readUInt16(14);
      }
      this.unfiltered *= g6Scale;
      this.filtered *= g6Scale;
    }
  }
}

SensorRxMessage.opcode = opcode;

module.exports = SensorRxMessage;

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
