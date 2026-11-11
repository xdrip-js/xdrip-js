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
    } else if (packet.length === 9 || packet.length === 18) {
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
  // 9-byte G7 record: time (uint24 LE) + 1 unused, glucose (uint16 LE, 12 bits,
  // 0xffff = none), algorithm state, flags (0x10 = display only),
  // trend (int8 tenths of mg/dL/min, 0x7f = none).
  // Matches xDrip+ BackFillStream, G7SensorKit G7BackfillMessage and g7sim.
  for (let i = 0; i <= this.data.length - 9; i += 9) {
    const dextime = this.data.readUIntLE(i, 3);
    const time = this.activationDate.getTime() + dextime * 1000;
    const glucoseBytes = this.data.readUInt16LE(i + 4);
    // eslint-disable-next-line no-bitwise
    const glucose = glucoseBytes === 0xffff ? null : glucoseBytes & 0xfff;
    const type = this.data.readUInt8(i + 6);
    // eslint-disable-next-line no-bitwise
    const isDisplayOnly = (this.data.readUInt8(i + 7) & 0x10) !== 0;
    const rawTrend = this.data.readInt8(i + 8);
    const trend = rawTrend === 0x7f ? null : rawTrend;
    debug(`dextime=${dextime}, time=${time}, glucose=${glucose}, type=${type}, trend=${trend}, displayOnly=${isDisplayOnly}`);
    const entry = {
      time,
      glucose,
      type,
      trend,
      isDisplayOnly,
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
