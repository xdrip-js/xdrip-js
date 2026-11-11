// Test helper: a G7 Transmitter whose BluetoothManager is replaced by a fake,
// so protocol logic in lib/transmitter.js runs without BlueZ / D-Bus.
//
// The real BluetoothManager connects to the D-Bus system bus in its
// constructor, so the module itself is swapped in require.cache before
// lib/transmitter is loaded.

const path = require('path');

const managerPath = require.resolve(path.join(__dirname, '../../lib/bluetooth-manager'));

class FakeBluetoothManager {
  constructor(delegate, deviceAddr) {
    this.delegate = delegate;
    this.deviceAddr = deviceAddr;
    this.written = [];
    this.replies = [];
  }

  async initializeBluetooth() { return this; }

  async unpairDevice() { return this; }

  async setupNotification(characteristic, callback = null) {
    this.notificationCallbacks = this.notificationCallbacks || {};
    if (callback) this.notificationCallbacks[characteristic] = callback;
  }

  async setNotifyEnabledAndWait() { return undefined; }

  // GATT read model: returns queued values in order, then keeps returning the
  // last value (a characteristic read yields its current value).
  async readValueAndWait(characteristic) {
    this.reads = this.reads || [];
    this.readCount = (this.readCount || 0) + 1;
    if (this.readCount > 1000) throw new Error('fake manager: read loop did not terminate');
    if (this.reads.length > 1) return this.reads.shift();
    if (this.reads.length === 1) return this.reads[0];
    throw new Error(`fake manager: nothing to read from ${characteristic}`);
  }

  async writeValueNoWait(data, characteristic) {
    if (this.writeDelayMs) await new Promise((r) => { setTimeout(r, this.writeDelayMs); });
    this.written.push({ data: Buffer.from(data), characteristic, noWait: true });
  }

  async writeValueAndWait(data, characteristic) {
    this.written.push({ data: Buffer.from(data), characteristic });
  }

  async writeValueAndWaitForNotification(data, characteristic) {
    this.written.push({ data: Buffer.from(data), characteristic });
    const next = this.replies.shift();
    if (next === undefined) throw new Error('fake manager: no more replies');
    return typeof next === 'function' ? next(data) : next;
  }
}

require.cache[managerPath] = {
  id: managerPath, filename: managerPath, loaded: true, exports: FakeBluetoothManager,
};

// eslint-disable-next-line import/order
const Transmitter = require('../../lib/transmitter');

// replies: Buffers (or functions(txData) => Buffer) returned, in order,
// by writeValueAndWaitForNotification.
function makeG7Transmitter({ id = '1234', replies = [], options } = {}) {
  const transmitter = new Transmitter(id, undefined, false, null, null, options);
  transmitter.manager.replies.push(...replies);
  return { transmitter, written: transmitter.manager.written, restore: () => {} };
}

module.exports = { makeG7Transmitter, FakeBluetoothManager, Transmitter };
