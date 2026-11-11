const chai = require('chai');

const should = chai.should();

const BackfillParserG7 = require('../lib/backfill-parser-g7');

// G7 backfill record (9 bytes), per xDrip+ BackFillStream (streamType > 0),
// LoopKit G7SensorKit G7BackfillMessage and LoopKit g7sim BackfillRecord:
//   0-2  seconds since activation (uint24 LE), 3 unused
//   4-5  glucose (uint16 LE, low 12 bits; 0xffff = no reading)
//   6    algorithm state
//   7    flags (0x10 = display only)
//   8    trend (int8, tenths of mg/dL/min; 0x7f = none)
const ACTIVATION = new Date('2026-11-01T00:00:00Z');

function parse(...hexRecords) {
  const parser = new BackfillParserG7(ACTIVATION);
  hexRecords.forEach((hex) => parser.push(Buffer.from(hex, 'hex')));
  return parser.parse();
}

describe('BackfillParserG7', () => {
  // Real sensor capture quoted in G7SensorKit's G7BackfillMessage.swift
  it('parses a real G7 record (trend comes from byte 8, not the flags byte)', () => {
    const [entry] = parse('45a100009600060ffc');
    entry.time.should.equal(ACTIVATION.getTime() + 0x00a145 * 1000);
    entry.glucose.should.equal(150);
    entry.type.should.equal(6);
    entry.trend.should.equal(-4);
    entry.isDisplayOnly.should.equal(false);
  });

  it('masks glucose to 12 bits and reports the display-only flag', () => {
    const [entry] = parse('100000009610061f05');
    entry.glucose.should.equal(150);
    entry.isDisplayOnly.should.equal(true);
    entry.trend.should.equal(5);
  });

  it('reports no glucose for 0xffff and no trend for 0x7f', () => {
    const [entry] = parse('10000000ffff020f7f');
    should.equal(entry.glucose, null);
    should.equal(entry.trend, null);
    entry.type.should.equal(2);
  });

  it('ignores byte 3 when reading the timestamp', () => {
    const [entry] = parse('45a100999600060ffc');
    entry.time.should.equal(ACTIVATION.getTime() + 0x00a145 * 1000);
  });

  it('parses several records in order', () => {
    const entries = parse('45a100009600060ffc', '71a200009b00060f05');
    entries.length.should.equal(2);
    entries[1].time.should.equal(ACTIVATION.getTime() + 0x00a271 * 1000);
    entries[1].glucose.should.equal(155);
    entries[1].trend.should.equal(5);
  });
});
