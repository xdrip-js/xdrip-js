const opcode = 0x5;

class AuthStatusRxMessage {
  constructor(data) {
    if ((data.length !== 3) || (data[0] !== opcode)) {
      throw new Error(`cannot create new AuthStatusRxMessage length: ${data.length}`);
    }

    [, this.authenticated, this.bonded] = data;
  }

  isAuthenticated() {
    return this.authenticated === 1;
  }

  isBonded() {
    return this.bonded === 1;
  }

  needsRefresh() {
    return this.bonded === 3;
  }
}

AuthStatusRxMessage.opcode = opcode;

module.exports = AuthStatusRxMessage;
