const debug = require('debug')('backfill-parser');

function BackfillParser(activationDate) {
  this.nextExpectedSequence = 1;
  this.activationDate = activationDate;
  this.data = Buffer.alloc(0);
  this.latestSeenTimestamp = 0;
  this.lastExpectedTimestamp = 0;
}

BackfillParser.prototype.setBackfillRxMessage = function setBackfillRxMessage(msg) {
  this.lastExpectedTimestamp = msg.timestampEnd;
};

BackfillParser.prototype.push = function push(packet) {
  debug(`data notification callback ${packet.toString('hex')}`);
  if (packet) {
    const sequence = packet.readUInt8(0);
    /* eslint-disable-next-line no-unused-vars */
    const identifier = packet.readUInt8(1);
    let trimmedPacket = null;

    if (sequence !== this.nextExpectedSequence) {
      debug(`out of sequence messages not supported yet. Expecting ${this.nextExpectedSequence}, got ${sequence}. Ignoring.`);
      // debug(`Data so far: ${JSON.stringify(this.parse())}`);
      return;
    }

    if (sequence === 1) {
      const backfillRequestCounter = packet.readUInt16LE(2);
      const unknown = packet.readUInt16LE(4);
      debug(`backfillRequestCounter=${backfillRequestCounter}, unknown=${unknown}`);
      trimmedPacket = packet.slice(6);
    } else {
      trimmedPacket = packet.slice(2);
    }

    this.nextExpectedSequence += 1;
    this.data = Buffer.concat([this.data, trimmedPacket]);
    // debug(`buffer so far: ${this.data.toString('hex')}`);
  }
};

BackfillParser.prototype.validate = function validate() {
  // FIXME: add additional validations from backfill response.
  return this.lastExpectedTimestamp !== 0;
};

BackfillParser.prototype.parse = function parse() {
  const result = [];
  debug('parsing backfill data');
  for (let i = 0; i <= this.data.length - 8; i += 8) {
    const dextime = this.data.readUInt32LE(i);
    const time = this.activationDate.getTime() + dextime * 1000;
    const glucose = this.data.readUInt16LE(i + 4);
    const type = this.data.readUInt8(i + 6);
    const trend = this.data.readInt8(i + 7);
    debug(`dextime=${dextime}, time=${time}, glucose=${glucose}, type=${type}, trend=${trend}`);
    const entry = {
      time,
      glucose,
      type,
      trend,
    };
    if (dextime > this.latestSeenTimestamp) {
      this.latestSeenTimestamp = dextime;
    }
    result.push(entry);
  }
  if (this.lastExpectedTimestamp === 0 || this.lastExpectedTimestamp !== this.latestSeenTimestamp) {
    debug(`ERROR: incorrect backfill lastExpectedTimestamp=${this.lastExpectedTimestamp} and latestSeenTimestamp=${this.latestSeenTimestamp}`);
    return [];
  }
  return result;
};

module.exports = BackfillParser;
