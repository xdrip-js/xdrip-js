const chai = require('chai');

chai.should();

const { makeG7Transmitter, Transmitter } = require('./helpers/g7-transmitter');

const HOUR = 3600;

const BOGUS = Buffer.from('00', 'hex'); // reply that no version parser accepts

describe('Transmitter (G7): pairing', () => {
  let fake;

  afterEach(() => fake && fake.restore());

  describe('requestBond (G7)', () => {
    // eslint-disable-next-line global-require
    const services = require('../lib/bluetooth-services').CGMServiceCharacteristic;

    it('writes the 0x07 bond request like the official app, then pairs at OS level', async () => {
      fake = makeG7Transmitter();
      const order = [];
      const origWrite = fake.transmitter.manager.writeValueAndWait.bind(fake.transmitter.manager);
      fake.transmitter.manager.writeValueAndWait = async (d, c) => {
        order.push(`write:${Buffer.from(d).toString('hex')}`);
        return origWrite(d, c);
      };
      fake.transmitter.manager.createBond = async () => { order.push('createBond'); return true; };
      const result = await fake.transmitter.requestBond();
      order.should.deep.equal(['write:07', 'createBond']);
      result.should.equal(true);
      const authWrites = fake.written.filter((w) => w.characteristic === services.Authentication);
      authWrites.length.should.equal(1); // no G6 keep-alive (the plugin already sent 06 19)
    });

    it('keeps waiting for the sensor (0x08) when the OS bond does not complete', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.manager.createBond = async () => false;
      (await fake.transmitter.requestBond()).should.equal(false);
      fake.written.some((w) => w.data[0] === 0x07).should.equal(true);
    });

    it('does not fail the handshake if asking BlueZ to pair throws', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.manager.createBond = async () => { throw new Error('org.bluez.Error.Failed'); };
      (await fake.transmitter.requestBond()).should.equal(false);
    });
  });

  describe('doNext (auth packet transport)', () => {
    // eslint-disable-next-line global-require
    const services = require('../lib/bluetooth-services').CGMServiceCharacteristic;

    async function sendExtraData(payload) {
      fake = makeG7Transmitter();
      fake.transmitter.plugin = { aNext: () => [null, payload], state: 0 };
      await fake.transmitter.doNext('test');
      return fake.written.filter((w) => w.characteristic === services.ExtraData).map((w) => w.data);
    }

    // The Dexcom G7 app (HCI snoop, 2026-11-10) writes the J-PAKE/cert stream
    // fragments to ExtraData WITHOUT response (ATT Write Command), as do
    // xDrip+, Juggluco and xDrip4iOS. Our first real-sensor pairing
    // (2026-11-10, attempt 60) used this too. It is the default for a G7.
    it('sends the stream fragments without response by default', async () => {
      delete process.env.XDRIP_EXTRADATA_NO_RESPONSE;
      await sendExtraData(Buffer.alloc(160));
      const chunks = fake.written.filter((w) => w.characteristic === services.ExtraData);
      chunks.length.should.equal(8);
      chunks.every((w) => w.noWait === true).should.equal(true);
    });

    it('can still use acknowledged writes (XDRIP_EXTRADATA_NO_RESPONSE=0)', async () => {
      process.env.XDRIP_EXTRADATA_NO_RESPONSE = '0';
      try {
        await sendExtraData(Buffer.alloc(160));
      } finally {
        delete process.env.XDRIP_EXTRADATA_NO_RESPONSE;
      }
      const chunks = fake.written.filter((w) => w.characteristic === services.ExtraData);
      chunks.every((w) => !w.noWait).should.equal(true);
    });

    // xDrip+, Juggluco and xDrip4iOS all write the J-PAKE stream fragments to
    // ExtraData WITHOUT response (ATT Write Command); only the Authentication
    // control opcodes use write-with-response. The real G7 returned 0a0300
    // (ioError) to our with-response fragments. This toggle lets us match the
    // reference transport and retest now that 0a01 follows within ~40 ms.
    it('sends the stream fragments without response when configured', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.extraDataNoResponse = true;
      fake.transmitter.plugin = { aNext: () => [null, Buffer.alloc(160)], state: 0 };
      await fake.transmitter.doNext('test');
      const chunks = fake.written.filter((w) => w.characteristic === services.ExtraData);
      chunks.length.should.equal(8);
      chunks.every((w) => w.noWait === true).should.equal(true);
    });

    // Dexcom app 2.15 sent its 8 round fragments 2-8 ms apart (~30 ms in
    // all) and 0a01 ~15 ms after the last one. We paced 40 ms per fragment.
    it('paces unacknowledged fragments like the Dexcom app', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.extraDataNoResponse = true;
      const times = [];
      tx.manager.writeValueNoWait = async () => { times.push(['chunk', Date.now()]); };
      tx.manager.writeValueAndWait = async () => { times.push(['control', Date.now()]); };
      tx.plugin = { aNext: () => [Buffer.from('0a01', 'hex'), Buffer.alloc(160)], state: 0 };
      await tx.doNext('test');
      const chunks = times.filter((t) => t[0] === 'chunk').map((t) => t[1]);
      const control = times.find((t) => t[0] === 'control')[1];
      (chunks[chunks.length - 1] - chunks[0]).should.be.below(80);
      (control - chunks[chunks.length - 1]).should.be.below(40);
    });

    it('sends a short payload in full', async () => {
      const payload = Buffer.from([...Array(15).keys()]);
      const chunks = await sendExtraData(payload);
      Buffer.concat(chunks).equals(payload).should.equal(true);
    });

    it('splits a long payload into 20-byte chunks without dropping bytes', async () => {
      const payload = Buffer.from([...Array(45).keys()]);
      const chunks = await sendExtraData(payload);
      chunks.map((c) => c.length).should.deep.equal([20, 20, 5]);
      Buffer.concat(chunks).equals(payload).should.equal(true);
    });

    it('continues with data that was already buffered before the step', async () => {
      fake = makeG7Transmitter();
      let pending = 1;
      const steps = [];
      fake.transmitter.plugin = {
        state: 0,
        aNext() { steps.push('aNext'); return [Buffer.from('0b', 'hex')]; },
        checkAccumulated() { if (pending) { pending -= 1; return true; } return false; },
      };
      await fake.transmitter.doNext('test');
      steps.length.should.equal(2);
    });

    // xDrip+ (Ob1G5StateMachine, length-1 keks result) switches to GET_DATA
    // and writes nothing; the glucose request then goes to Control.
    it('writes nothing to Authentication when the plugin is ready for data', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.plugin = { aNext: () => [Buffer.from('4e', 'hex')], state: 0 };
      await fake.transmitter.doNext('test');
      fake.written.length.should.equal(0);
    });

    // xDrip4iOS (works with real G7s) sends the stream fragments ~40 ms apart
    // and the control packet ~40 ms after the last one. We waited ~2 s before
    // 0a01, and a real G7 hung up right after receiving it.
    it('sends the control packet promptly after the stream fragments', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.extraDataNoResponse = false; // acknowledged-write path
      const times = [];
      fake.transmitter.manager.writeValueAndWait = async (d, c) => {
        times.push([c === services.ExtraData ? 'chunk' : 'control', Date.now()]);
      };
      fake.transmitter.plugin = { aNext: () => [Buffer.from('0a01', 'hex'), Buffer.alloc(160)], state: 0 };
      await fake.transmitter.doNext('test');
      const lastChunk = times.filter((t) => t[0] === 'chunk').pop()[1];
      const control = times.find((t) => t[0] === 'control')[1];
      (control - lastChunk).should.be.below(150);
    });

    it('validates deferred sensor proofs only after our reply is written', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.extraDataNoResponse = false; // acknowledged-write path
      const order = [];
      fake.transmitter.manager.writeValueAndWait = async (d, c) => {
        order.push(c === services.ExtraData ? 'chunk' : 'control');
      };
      fake.transmitter.plugin = {
        aNext: () => [Buffer.from('0a01', 'hex'), Buffer.alloc(160)],
        validateDeferred: () => { order.push('validate'); return true; },
        state: 0,
      };
      await fake.transmitter.doNext('test');
      order[order.length - 1].should.equal('validate');
      order.filter((o) => o === 'control').length.should.equal(1);
    });

    it('does nothing when the plugin has no next step', async () => {
      fake = makeG7Transmitter();
      fake.transmitter.plugin = { aNext: () => null, state: 0 };
      await fake.transmitter.doNext('test');
      fake.written.length.should.equal(0);
    });
  });

  describe('authenticateAndPairG7', () => {
    // eslint-disable-next-line global-require
    const Plugin = require('../lib/keks_plugin/plugin');
    // eslint-disable-next-line global-require
    const { CGMServiceCharacteristic: uuid } = require('../lib/bluetooth-services');

    const tick = () => new Promise((r) => { setImmediate(r); });

    // Plugin stand-in that behaves like the real one on reconnect: 05 01 01
    // moves it to GetData2, and the following aNext() moves it to Unknown.
    function reconnectingPlugin() {
      return {
        state: Plugin.RoundStart,
        responses: [],
        amConnected() {},
        aNext() {
          if (this.state === Plugin.GetData2) {
            this.state = Plugin.Unknown;
            return [Buffer.from('4e', 'hex')];
          }
          return [Buffer.from('02', 'hex'), null];
        },
        receivedResponse(data) {
          this.responses.push(data.toString('hex'));
          if (data.toString('hex') === '050101') { this.state = Plugin.GetData2; return true; }
          return false;
        },
        getSharedKey: () => Buffer.alloc(16, 1),
      };
    }

    // xDrip+ (Ob1G5StateMachine, G7 keks path) receives Authentication as
    // indications and handles each one once, in arrival order. On 05 01 01
    // (authenticated, already bonded) it goes straight to GET_DATA.
    it('finishes on reconnect once the sensor reports authenticated and bonded', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.plugin = reconnectingPlugin();

      const done = tx.authenticateAndPairG7();
      await tick();
      tx.manager.notificationCallbacks[uuid.Authentication](Buffer.from('050101', 'hex'));

      (await done).should.equal(true);
      fake.written.filter((w) => w.data[0] === 0x07).length.should.equal(0); // no bond request
    });

    // Dexcom G7 app 2.15 (HCI snoop of a successful re-pair, 2026-11-10):
    // write CCCD 0x0018 (Authentication, indicate) first, then 0x001e
    // (ExtraData, notify), then 0a00. We subscribed ExtraData first.
    it('subscribes to Authentication before ExtraData, like the Dexcom app', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.plugin = reconnectingPlugin();
      const order = [];
      const orig = tx.manager.setupNotification.bind(tx.manager);
      tx.manager.setupNotification = async (c, cb) => { order.push(c); return orig(c, cb); };

      const done = tx.authenticateAndPairG7();
      await tick();
      tx.manager.notificationCallbacks[uuid.Authentication](Buffer.from('050101', 'hex'));
      await done;

      order.indexOf(uuid.Authentication).should.be.below(order.indexOf(uuid.ExtraData));
    });

    it('handles each Authentication indication exactly once', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.plugin = reconnectingPlugin();

      const done = tx.authenticateAndPairG7();
      await tick();
      const notify = tx.manager.notificationCallbacks[uuid.Authentication];
      notify(Buffer.from('0300', 'hex'));
      notify(Buffer.from('050101', 'hex'));
      await done;

      tx.plugin.responses.should.deep.equal(['0300', '050101']);
    });

    // During the key exchange the sensor talks on ExtraData, not
    // Authentication; on a Pi Zero one round can take several seconds.
    it('keeps waiting while ExtraData is still arriving', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.plugin = reconnectingPlugin();
      tx.plugin.receivedData = () => false;
      tx.authResponseTimeoutMs = 60;

      const done = tx.authenticateAndPairG7();
      await tick();
      const extra = tx.manager.notificationCallbacks[uuid.ExtraData];
      for (let i = 0; i < 5; i += 1) {
        // eslint-disable-next-line no-await-in-loop
        await new Promise((r) => { setTimeout(r, 40); });
        extra(Buffer.alloc(20)); // 200 ms of ExtraData, well past the timeout
      }
      tx.manager.notificationCallbacks[uuid.Authentication](Buffer.from('050101', 'hex'));

      (await done).should.equal(true);
    });

    // Seen with a real G7: round-1 validation took 12 s on the Pi Zero and
    // writing our reply over a weak link another 4 s; the 15 s idle timeout
    // fired although we were busy, and we dropped the sensor ourselves.
    it('does not time out while our own reply is still being written', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.manager.writeDelayMs = 40; // 8 chunks: 320 ms, plus doNext's own pause
      const plugin = reconnectingPlugin();
      let gotRound1 = false;
      plugin.receivedData = () => { if (gotRound1) return false; gotRound1 = true; return true; };
      plugin.aNext = function aNext() {
        if (this.state === Plugin.GetData2) { this.state = Plugin.Unknown; return [Buffer.from('4e', 'hex')]; }
        if (gotRound1) return [null, Buffer.alloc(160)]; // our round-1 packet
        return [Buffer.from('0a00', 'hex'), null];
      };
      tx.plugin = plugin;
      // longer than doNext's fixed 500 ms pause, shorter than the whole reply
      // (~820 ms): without activity marks during the write it times out
      tx.authResponseTimeoutMs = 600;

      const done = tx.authenticateAndPairG7();
      await tick();
      tx.manager.notificationCallbacks[uuid.ExtraData](Buffer.alloc(20));
      // the reply is written for ~0.8 s; the sensor answers after that
      await new Promise((r) => { setTimeout(r, 900); });
      tx.manager.notificationCallbacks[uuid.Authentication](Buffer.from('050101', 'hex'));

      (await done).should.equal(true);
    });

    it('fails instead of hanging when the sensor stops responding', async () => {
      fake = makeG7Transmitter();
      const tx = fake.transmitter;
      tx.plugin = reconnectingPlugin();
      tx.authResponseTimeoutMs = 50;

      let error;
      try { await tx.authenticateAndPairG7(); } catch (err) { error = err; }
      chai.expect(error).to.be.an('error');
      error.message.should.match(/Timeout waiting for Authentication/);
    });
  });

});
