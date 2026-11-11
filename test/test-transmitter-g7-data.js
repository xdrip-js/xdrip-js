const chai = require('chai');

chai.should();

const { makeG7Transmitter, Transmitter } = require('./helpers/g7-transmitter');

const HOUR = 3600;

const BOGUS = Buffer.from('00', 'hex'); // reply that no version parser accepts

describe('Transmitter (G7): data and slot', () => {
  let fake;

  afterEach(() => fake && fake.restore());

  describe('processVersion', () => {
    async function versionFor(reply52) {
      fake = makeG7Transmitter({ replies: [BOGUS, Buffer.from(reply52, 'hex')] });
      let emitted;
      fake.transmitter.on('version', (v) => { emitted = v; });
      await fake.transmitter.processVersion();
      return emitted;
    }

    it('reports session length and warmup for a 15-day sensor', async () => {
      const v = await versionFor('5200406f1400880e00010a04ff1100');
      v.sessionLengthSeconds.should.equal(1339200);
      v.warmupSeconds.should.equal(3720);
      v.typicalSensorDays.should.equal(15);
      v.maxLifetimeDays.should.equal(17);
    });

    // xDrip+ requiredNextFirmwareDetailsType: a G7 (short id) is asked for
    // version types 1 (0x4a) and 2 (0x52) only; it does not answer 0x20.
    it('asks a G7 for version types 1 and 2 only', async () => {
      await versionFor('5200c0d70d00540600020404ff0c00');
      fake.written.map((w) => w.data[0]).should.deep.equal([0x4a, 0x52]);
    });

    it('still asks for 0x52 when the 0x4a request times out', async () => {
      fake = makeG7Transmitter({
        replies: [() => { throw new Error('Timeout waiting for notification'); },
          Buffer.from('5200406f1400880e00010a04ff1100', 'hex')],
      });
      let emitted;
      fake.transmitter.on('version', (v) => { emitted = v; });
      await fake.transmitter.processVersion();
      emitted.sessionLengthSeconds.should.equal(1339200);
    });

    it('reports session length and warmup for a 10-day sensor', async () => {
      const v = await versionFor('5200c0d70d00540600020404ff0c00');
      v.sessionLengthSeconds.should.equal(907200);
      v.warmupSeconds.should.equal(1620);
      v.typicalSensorDays.should.equal(10);
    });
  });

  // Official Dexcom G7 app pairing trace (DiaBLE DexcomG7.swift, sniffed from
  // the real app): write 06 19 -> notify 06 00 -> write 07 -> notify 07 00 ->
  // notify 08 01. So the app-level 0x07 RequestBond IS part of the G7 flow.
  // The phone OS also forms a BLE bond at this point (the app SDK has
  // bond()/awaitBondFromPeripheral()); xDrip+ calls createBond() and writes
  // 0x07. Our requestBond() used to write 0x07 but never asked BlueZ to pair.
  // Downstream of J-PAKE, so it only matters once pairing gets that far.
  describe('shouldConnect (G7)', () => {
    it('accepts any DXCM device when nothing is pinned or saved', () => {
      fake = makeG7Transmitter();
      fake.transmitter.shouldConnect('DXCMab', 'AA:BB:CC:DD:EE:01', -60).should.equal(true);
    });

    // Lab safety: pin to the simulator so a nearby real sensor is never touched
    it('only connects to the pinned sensor address, even before pairing', () => {
      fake = makeG7Transmitter({ options: { sensorAddress: 'aa:bb:cc:dd:ee:01' } });
      fake.transmitter.shouldConnect('DXCMzz', 'AA:BB:CC:DD:EE:02', -60).should.equal(false);
      fake.transmitter.shouldConnect('DXCMab', 'AA:BB:CC:DD:EE:01', -60).should.equal(true);
    });

    it('lets the pin win over a saved address from another sensor', () => {
      fake = makeG7Transmitter({ options: { sensorAddress: 'AA:BB:CC:DD:EE:01' } });
      fake.transmitter.savedMacAddress = 'AA:BB:CC:DD:EE:02';
      fake.transmitter.shouldConnect('DXCMzz', 'AA:BB:CC:DD:EE:02', -60).should.equal(false);
    });
  });

  describe('readGlucose (G7)', () => {
    it('requests glucose with the single byte 0x4e on Control', async () => {
      const reply = Buffer.from('4e0006e10d00da0b00014e00670006fe65000f', 'hex');
      fake = makeG7Transmitter({ replies: [reply] });
      const msg = await fake.transmitter.readGlucose();
      fake.written[0].data.toString('hex').should.equal('4e');
      msg.glucose.should.equal(103);
    });
  });

  describe('g7ActivationDate', () => {
    it('is now minus the sensor clock, not minus the reading age', () => {
      const now = Date.parse('2026-11-08T12:00:00Z');
      const activation = Transmitter.g7ActivationDate({ timestamp: 909574, age: 78 }, now);
      activation.getTime().should.equal(now - 909574 * 1000);
    });
  });

  describe('backfillWindow', () => {
    it('allows up to 24 hours of G7 backfill', () => {
      const w = Transmitter.backfillWindow(10 * HOUR, 40 * HOUR, 40 * HOUR, true);
      w.start.should.equal(16 * HOUR);
      w.end.should.equal(40 * HOUR);
    });

    it('keeps the 3 hour limit for G5/G6', () => {
      const w = Transmitter.backfillWindow(10 * HOUR, 40 * HOUR, 40 * HOUR, false);
      w.start.should.equal(37 * HOUR);
    });

    it('never requests before activation', () => {
      const w = Transmitter.backfillWindow(-600, 1800, 1900, true);
      w.start.should.equal(0);
    });

    it('rounds to whole seconds', () => {
      const w = Transmitter.backfillWindow(100.7, 1800.2, 1900, true);
      w.start.should.equal(100);
      w.end.should.equal(1800);
    });

    it('processBackfill skips an empty window without touching Bluetooth', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.backfill = true;
      tx.activationDate = new Date(Date.now() - 1900 * 1000);
      tx.backfill_start = -600; // a gap that ends before activation
      tx.backfill_end = -5;
      tx.parser = { stale: true };
      await tx.processBackfill();
      fake.written.length.should.equal(0);
      chai.expect(tx.parser).to.equal(null);
    });

    // Seen over the air: after a restart Lookout asked for backfill up to
    // "now", which included the reading collected in the same connection,
    // so that reading was uploaded twice (as backfill and as live glucose).
    it('ends a G7 backfill before the reading being collected', () => {
      const w = Transmitter.backfillWindow(10 * HOUR, 12 * HOUR, 12 * HOUR, true, 11 * HOUR);
      w.end.should.equal(11 * HOUR - 30);
    });

    // A lab simulator may read every 60 s: the reading before the current one
    // must stay inside the window.
    it('keeps the previous reading at a 60 s cycle', () => {
      const w = Transmitter.backfillWindow(10 * HOUR, 12 * HOUR, 12 * HOUR, true, 11 * HOUR);
      (w.end >= 11 * HOUR - 60).should.equal(true);
    });

    it('is empty when only the current reading is in the window', () => {
      chai.expect(Transmitter.backfillWindow(11 * HOUR - 30, 12 * HOUR, 12 * HOUR, true, 11 * HOUR))
        .to.equal(null);
    });

    it('returns null when the window is empty', () => {
      chai.expect(Transmitter.backfillWindow(1800, 1800, 1900, true)).to.equal(null);
      chai.expect(Transmitter.backfillWindow(1800, -5, 1900, true)).to.equal(null);
    });
  });
});
