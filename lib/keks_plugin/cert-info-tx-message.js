const opcode = 0xb;

function CertInfoTxMessage2(which, context) {

  const arrayLE = new DataView(new ArrayBuffer(4));
  arrayLE.setInt32(0, which ? context.getPartA().length : context.getPartB().length], true);

  this.data = Buffer.concat([
    Buffer.from([opcode]),
    Buffer.from([which]),
    Buffer.from(arrayLE.buffer),
  ]);
}

CertInfoTxMessage2.opcode = opcode;

module.exports = CertInfoTxMessage2;

