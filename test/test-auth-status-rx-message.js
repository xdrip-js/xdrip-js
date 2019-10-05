const should = require('chai').should();
const AuthStatusRxMessage = require('../lib/messages/auth-status-rx-message');

describe('AuthStatusRxMessage', function() {
  describe('constructor', function() {
    it('should parse properly constructed AuthStatusRxMessage data', function() {
      const data = Buffer.from("050101", "hex");
      const message = new AuthStatusRxMessage(data);
      message.authenticated.should.equal(1);
      message.bonded.should.equal(1);
    });

    it('should throw if the first byte is not 0x5', function() {
      (function() {
        const data = Buffer.from("000000", "hex");
        const message = new AuthStatusRxMessage(data);
      }).should.throw();
    });

    it('should throw if the message is shorter than three bytes', function() {
      (function() {
        const data = Buffer.from("05", "hex");
        const message = new AuthStatusRxMessage(data);
      }).should.throw();
    });
  });
});
