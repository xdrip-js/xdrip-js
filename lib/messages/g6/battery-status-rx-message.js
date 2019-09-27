const opcode = 0x23;

function BatteryStatusRxMessage(data) {
  if ((data.length !== 10) || (data[0] !== opcode)) {
    throw new Error('cannot create new BatteryStatusRxMessage');
  }
  this.status = data.readUInt8(1);
  this.voltagea = data.readUInt16LE(2);
  this.voltageb = data.readUInt16LE(4);
  this.runtime = data.readUInt8(6);
  this.temperature = data.readUInt8(7);
  // console.log("got battery response.");
  // console.log("    voltagea = " + this.voltagea);
  // console.log("    voltageb = " + this.voltageb);
  // console.log("    resist = " + this.resist);
  // console.log("    temperature = " + this.temperature);
}

module.exports = BatteryStatusRxMessage;

//
// example Battery status message and response
//  bluetooth-manager Tx 222004 +37ms
//  bluetooth-manager Rx 230032011c01001eda2d +26ms
