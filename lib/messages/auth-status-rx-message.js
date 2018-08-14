const opcode = 0x5;

function AuthStatusRxMessage(data) {
  if ((data.length !== 3) || (data[0] !== opcode)) {
    throw new Error('cannot create new AuthStatusRxMessage');
  }
  [, this.authenticated, this.bonded] = data;
}

AuthStatusRxMessage.opcode = opcode;

module.exports = AuthStatusRxMessage;
