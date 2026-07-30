const should = require('chai').should();
const AuthStatusRxMessage = require('../lib/messages/auth-status-rx-message');

describe('AuthStatusRxMessage', () => {
  describe('constructor', () => {
    it('should parse properly constructed AuthStatusRxMessage data', () => {
      const data = Buffer.from('050101', 'hex');
      const message = new AuthStatusRxMessage(data);
      message.authenticated.should.equal(1);
      message.bonded.should.equal(1);
    });

    it('should throw if the first byte is not 0x5', () => {
      (function () {
        const data = Buffer.from('000000', 'hex');
        const message = new AuthStatusRxMessage(data);
      }).should.throw();
    });

    it('should throw if the message is shorter than three bytes', () => {
      (function () {
        const data = Buffer.from('05', 'hex');
        const message = new AuthStatusRxMessage(data);
      }).should.throw();
    });
  });
});
