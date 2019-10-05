const crc = require('../crc');
const dotted = require('../dotted-string-converter');

const opcode = 0x21;

function VersionRequestRx0Message(data) {
  if (data.length !== 18) {
    throw new Error(`cannot create new VersionRequestRx0Message - invalid length = ${data.length}`);
  } else if (data[0] !== opcode) {
    throw new Error(`cannot create new VersionRequestRx0Message - invalid opcode = ${data[0]}`);
  } else if (!crc.crcValid(data)) {
    throw new Error('cannot create new VersionRequestRx0Message - invalid CRC');
  }

  this.status = data.readUInt8(1);
  this.firmwareVersion = dotted.fromData(data.slice(2, 6), 4);
  this.btFirmwareVersion = dotted.fromData(data.slice(6, 10), 4);
  this.hardwareRev = data.readUInt8(10);
  this.otherFirmwareVersion = dotted.fromData(data.slice(11, 15), 3);
  this.asic = data.readUInt16LE(15);
}

VersionRequestRx0Message.opcode = opcode;

module.exports = VersionRequestRx0Message;

// 21000212025802120258ff00314541412412
//
// opcode:            0x21
// status:            0x00
// version:           2.18.2.88 (0x02120258)
// BT version:        2.18.2.88 (0x02120258)
// H/W rev:           255 (0xff)
// other F/W version: 0.49.69 (0x003145)
// asic:              0x4141
