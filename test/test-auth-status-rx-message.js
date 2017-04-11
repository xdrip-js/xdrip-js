var should = require('chai').should 
var AuthStatusRxMessage = require('../lib/messages/auth-status-rx-message')

describe('AuthStatusRxMessage', function() {
  it('should not throw', function() {
    (function() {
      var data = Buffer.from("050101", "hex")
      var message = new AuthStatusRxMessage(data);
    }).should.not.throw();
  });
});
