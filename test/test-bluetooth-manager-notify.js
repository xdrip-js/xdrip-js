const EventEmitter = require('events');
const path = require('path');
const { expect } = require('chai');

const SerialOperationQueue = require('../lib/serial-operation-queue');

// Load the real BluetoothManager even if another test swapped it out in
// require.cache (test/helpers/g7-transmitter.js), and restore afterwards.
const managerPath = require.resolve(path.join(__dirname, '../lib/bluetooth-manager'));
const swapped = require.cache[managerPath];
delete require.cache[managerPath];
const BluetoothManager = require('../lib/bluetooth-manager');

if (swapped) require.cache[managerPath] = swapped;
else delete require.cache[managerPath];

// node-ble 1.13 GattCharacteristic.startNotifications() adds a new
// PropertiesChanged listener on EVERY call, so subscribing twice delivers
// every value twice (seen over the air: each 20-byte J-PAKE chunk arrived
// twice and round 1 failed to validate).
class FakeCharacteristic extends EventEmitter {
  constructor() {
    super();
    this.listeners = 0;
    this.notifying = false;
  }

  async startNotifications() {
    this.listeners += 1;
    this.notifying = true;
  }

  async stopNotifications() {
    if (!this.notifying) throw new Error('No notify session started');
    this.listeners = 0;
    this.notifying = false;
  }

  deliver(value) { // what BlueZ does for one notification
    for (let i = 0; i < this.listeners; i += 1) this.emit('valuechanged', value);
  }
}

function makeManager(uuid, characteristic) {
  const m = Object.create(BluetoothManager.prototype); // skip the D-Bus constructor
  m.characteristicsMap = new Map([[uuid, characteristic]]);
  m.btQueue = new SerialOperationQueue('test', 0);
  m.addDisconnectAbortHandler = () => () => {};
  return m;
}

describe('BluetoothManager notifications', () => {
  const UUID = 'f8083538-849e-531c-c594-30f1f86a4ea5';

  it('delivers each value once after setupNotification + setNotifyEnabledAndWait', async () => {
    const ch = new FakeCharacteristic();
    const m = makeManager(UUID, ch);
    const got = [];
    await m.setupNotification(UUID, (v) => got.push(v));
    await m.setNotifyEnabledAndWait(true, UUID);
    ch.deliver(Buffer.from('01', 'hex'));
    expect(got.length).to.equal(1);
  });

  it('does not fail when disabling notifications that were never started', async () => {
    const ch = new FakeCharacteristic();
    const m = makeManager(UUID, ch);
    await m.setNotifyEnabledAndWait(false, UUID);
  });

  it('can re-enable after disabling', async () => {
    const ch = new FakeCharacteristic();
    const m = makeManager(UUID, ch);
    const got = [];
    await m.setupNotification(UUID, (v) => got.push(v));
    await m.setNotifyEnabledAndWait(false, UUID);
    await m.setNotifyEnabledAndWait(true, UUID);
    ch.deliver(Buffer.from('02', 'hex'));
    expect(ch.listeners).to.equal(1);
  });
});

describe('BluetoothManager discovery', () => {
  const ADDR = '6A:10:D7:6A:06:E6';

  function makeDiscoveryManager(shouldConnect) {
    const m = Object.create(BluetoothManager.prototype);
    m.seenDevices = new Set();
    m.lastDiscoveredAddress = null;
    m.lastDiscoveredTime = 0;
    m.delegate = { shouldConnect };
    const device = {
      getAddress: async () => ADDR,
      getName: async () => 'DXCMkr',
      getRSSI: async () => -40,
    };
    m.getAdapter = async () => ({ devices: async () => [ADDR], getDevice: async () => device });
    return m;
  }

  // Seen over the air: a connect attempt failed (the sensor refused a second
  // link in the same window); 2 s later the sensor was rediscovered, treated
  // as a "duplicate", and blacklisted for the rest of the session, so the
  // next window's reading was missed.
  it('does not blacklist the sensor when it is rediscovered within 3 s', async () => {
    const m = makeDiscoveryManager(() => false);
    m.lastDiscoveredAddress = ADDR;
    m.lastDiscoveredTime = Date.now();
    await m.checkForDevices();
    expect(m.seenDevices.has(ADDR)).to.equal(false);
  });

  it('still remembers devices the delegate does not want', async () => {
    const m = makeDiscoveryManager(() => false);
    await m.checkForDevices();
    expect(m.seenDevices.has(ADDR)).to.equal(true);
  });
});

// Seen with a real G7: discovery kept running during the handshake ("Found
// device ... RSSI" logged after connecting), and validating round 1 took 12 s
// on the Pi Zero instead of ~1-2 s. xDrip+ stops scanning once connected;
// discovery restarts from handleDisconnect when the link ends.
describe('BluetoothManager on connect', () => {
  it('stops discovery and device polling before the handshake', async () => {
    const m = Object.create(BluetoothManager.prototype);
    const calls = [];
    const poller = setInterval(() => {}, 100000);
    m.devicePoller = poller;
    m.getAdapter = async () => ({
      isDiscovering: async () => true,
      stopDiscovery: async () => { calls.push('stopDiscovery'); },
    });
    m.connectStartTime = Date.now();
    m.device = {
      gatt: async () => ({
        services: async () => [],
        getPrimaryService: async () => ({}),
      }),
    };
    m.discoverCharacteristicsAndWait = async () => {
      calls.push('handshake');
      return new Set();
    };
    m.delegate = { isReady: () => {} };

    try {
      await m.didDeviceConnect();
    } finally {
      clearInterval(poller); // never leave a timer behind, pass or fail
    }

    expect(m.devicePoller).to.equal(null);
    expect(calls).to.deep.equal(['stopDiscovery', 'handshake']);
  });
});

// Every D-Bus round trip costs time on a Pi Zero; the handshake writes to the
// Authentication characteristic must not first query its flags/notify state.
describe('BluetoothManager.writeValueAndWait', () => {
  it('writes without extra diagnostic D-Bus calls', async () => {
    const UUID = 'f8083535-849e-531c-c594-30f1f86a4ea5';
    const calls = [];
    const ch = {
      getFlags: async () => { calls.push('getFlags'); return []; },
      isNotifying: async () => { calls.push('isNotifying'); return true; },
      writeValueWithResponse: async () => { calls.push('write'); },
    };
    const m = Object.create(BluetoothManager.prototype);
    m.characteristicsMap = new Map([[UUID, ch]]);
    m.btQueue = new SerialOperationQueue('test', 0);
    m.addDisconnectAbortHandler = () => () => {};
    await m.writeValueAndWait(Buffer.from('0a01', 'hex'), UUID);
    expect(calls).to.deep.equal(['write']);
  });
});

// A real G7's advertising burst lasts up to ~26 s. At the edge of range
// (RSSI -94 seen live) many adverts are lost and a 10 s connect attempt
// timed out; allow most of a burst.
describe('BluetoothManager connect timeout', () => {
  it('waits long enough to catch a weak sensor within one burst', () => {
    const fs = require('fs'); // eslint-disable-line global-require
    const src = fs.readFileSync(require.resolve('../lib/bluetooth-manager'), 'utf8');
    const m = /this\.CONNECT_TIMEOUT_MS = (\d+);/.exec(src);
    expect(Number(m[1])).to.be.at.least(25000);
  });
});
