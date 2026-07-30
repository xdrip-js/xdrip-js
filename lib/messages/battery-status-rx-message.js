const opcode = 0x23;
const opcode2 = 0x22;

function BatteryStatusRxMessage(data) {
  if ((data.length < 10) || ((data[0] !== opcode) && data[0] !== opcode2)) {
    throw new Error(`cannot create new BatteryStatusRxMessage length=${data.length} opcode=${data[0]}`);
  }

  let offset = 1;

  this.status = data.readUInt8(offset);
  offset += 1;

  this.voltagea = data.readUInt16LE(offset);
  offset += 2;

  this.voltageb = data.readUInt16LE(offset);
  offset += 2;

  this.resist = null;
  if (data.length !== 10) {
    this.resist = data.readUInt16LE(offset);
    offset += 2;
  }

  this.runtime = data.readUInt8(offset);
  offset += 1;

  this.temperature = data.readUInt8(offset);
  offset += 1;
}

module.exports = BatteryStatusRxMessage;

//
// example Battery status message and response
//  bluetooth-manager Tx 222004 +37ms
//  bluetooth-manager Rx 230032011c01001eda2d +26ms
