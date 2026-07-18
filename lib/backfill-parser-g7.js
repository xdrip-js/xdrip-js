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
    if (packet.length === 10 || packet.length === 19) {
      const trimmedPacket = packet.slice(0, -1);
      this.data = Buffer.concat([this.data, trimmedPacket]);
      debug(`buffer so far: ${this.data.toString('hex')}`);
    } else if (packet.length == 9 || packet.length === 18) {
      this.data = Buffer.concat([this.data, packet]);
      debug(`buffer so far: ${this.data.toString('hex')}`);
    } else {
      debug(`length not recognized: ${packet.length}`);
    }
  }
};

BackfillParser.prototype.validate = function validate() {
  return true;
};

BackfillParser.prototype.parse = function parse() {
  const result = [];
  debug('parsing backfill data');
  for (let i = 0; i <= this.data.length - 9; i += 9) {
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
  }
  return result;
};

module.exports = BackfillParser;
