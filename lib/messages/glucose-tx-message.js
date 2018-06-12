const crc = require('../crc');

var opcode = 0x30;

function GlucoseTxMessage(id) {
  f2 = id.substr(0,2);
  // if serial number starts with 80xxxx or 81xxxx then assume g6 and use g6 GlucoseTx opcode = 0x4e
  if (f2 == "80" || f2 == "81") {
	opcode = 0x4e;
  }

  this.data = Buffer.from([opcode]);
  const crcBuffer = Buffer.allocUnsafe(2);
  crcBuffer.writeUInt16LE(crc.crc16(this.data));
  this.data = Buffer.concat([this.data, crcBuffer]);
}

function firstTwoCharactersOfString(string) {
  return string.substr(0,2);
}


GlucoseTxMessage.opcode = opcode;

module.exports = GlucoseTxMessage;
