const opcode = 0xb;

function CertInfoRxMessage(data) {
  if ((data.length !== 7) || (data[0] !== opcode)) {
    throw new Error('cannot create new AuthStatusRxMessage');
  }
  [, this.state, this.which, size1, size2] = data;

  this.size = size2 * 256 + size1;
}

CertInfoRxMessage.opcode = opcode;

module.exports = CertInfoRxMessage;
