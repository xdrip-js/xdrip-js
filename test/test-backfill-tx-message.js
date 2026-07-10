const should = require('chai').should();
const BackfillTxMessage = require('../lib/messages/backfill-tx-message');

describe('BackfillTxMessage', () => {
  it('construct a message', () => {
    const timestampStart = 0;
    const timestampEnd = 300;
    const message = new BackfillTxMessage(timestampStart, timestampEnd);
    message.data.length.should.equal(20);
  });
});
