var should = require('chai').should 
var Transmitter = require(../lib/Transmitter)

describe('Transmitter', function() {
  it('should not throw', function() {
    (function() {
      var transmitter = new Transmitter();
    }).should.not.throw();
  });
});
