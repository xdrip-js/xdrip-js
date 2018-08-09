const opcode = 0x23;

function BatteryStatusRxMessage(data) {
  if ((data.length !== 12) || (data[0] !== opcode)) {
    throw new Error('cannot create new BatteryStatusRxMessage');
  }
  this.status = data.readUInt8(1);
  this.voltagea = data.readUInt16LE(2);
  this.voltageb = data.readUInt16LE(4);
  this.resist = data.readUInt16LE(6);
  this.runtime = data.readUInt8(8);
  this.temperature = data.readUInt8(9);
  // console.log("got battery response.");
  // console.log("    voltagea = " + this.voltagea);
  // console.log("    voltageb = " + this.voltageb);
  // console.log("    resist = " + this.resist);
  // console.log("    runtime = " + this.runtime);
  // console.log("    temperature = " + this.temperature);
}

module.exports = BatteryStatusRxMessage;

//
// example Battery status message and response
//  bluetooth-manager Tx 222004 +37ms
//  bluetooth-manager Rx 230039012a016b03021e2dbd +26ms
