const { expect } = require('chai');

const Plugin = require('../lib/keks_plugin/plugin');

const SAVED_KEY = '00112233445566778899aabbccddeeff';

describe('KEKS Plugin persistence (channel 2: saved shared key)', () => {
  afterEach(() => { Plugin.instance = null; });

  it('loads a saved key', () => {
    const plugin = Plugin.getInstance('1234');
    expect(plugin.setPersistence(2, SAVED_KEY)).to.equal(true);
    expect(plugin.getSharedKey().toString('hex')).to.equal(SAVED_KEY);
  });

  // transmitter.js calls setPersistence(2, null) when the sensor's MAC no
  // longer matches the one the key was negotiated with.
  it('forgets the saved key when given null, so a new key is negotiated', () => {
    const plugin = Plugin.getInstance('1234');
    plugin.setPersistence(2, SAVED_KEY);
    expect(plugin.setPersistence(2, null)).to.equal(true);
    expect(plugin.getSharedKey()).to.equal(null);
  });
});
