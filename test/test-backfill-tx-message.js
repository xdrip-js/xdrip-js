const should = require('chai').should();
const BackfillTxMessage = require('../lib/messages/backfill-tx-message');

describe('BackfillTxMessage', function() {
  it('construct a message', function() {
      const timestampStart = 0;
      const timestampEnd = 300;
      const message = new BackfillTxMessage(timestampStart, timestampEnd);
      message.data.length.should.equal(11);
  });
});
