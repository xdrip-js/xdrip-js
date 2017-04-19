var should = require('chai').should();
var AuthStatusRxMessage = require('../lib/messages/auth-status-rx-message');

describe('AuthStatusRxMessage', function() {
  describe('constructor', function() {
    it('should parse a properly constructed message', function() {
      var data = Buffer.from("050101", "hex");
      var message = new AuthStatusRxMessage(data);
      message.authenticated.should.equal(1);
      message.bonded.should.equal(1);
    });

    it('should throw if the first byte is not 0x5', function() {
      (function() {
        var data = Buffer.from("000000", "hex");
        var message = new AuthStatusRxMessage(data);
      }).should.throw();
    });

    it('should throw if the message is shorter than three bytes', function() {
      (function() {
        var data = Buffer.from("05", "hex");
        var message = new AuthStatusRxMessage(data);
      }).should.throw();
    });
  });
});
