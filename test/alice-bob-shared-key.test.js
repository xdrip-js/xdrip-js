// alice-bob-shared-key.test.js
// Full Alice/Bob J-PAKE simulation test
// Verifies both sides derive the same shared key

const { expect } = require('chai');
const Plugin = require('../lib/keks_plugin/plugin');
const BlePacket = require('../lib/keks_plugin/ble-packet'); // Your 160-byte transport packet
const Config = require('../lib/keks_plugin/config');
const Calc = require('../lib/keks_plugin/calc');
const debug = require('debug');

describe('KEKS J-PAKE: Alice and Bob shared key equality', function () {
  this.timeout(10000); // Crypto can be slow in tests
  debug.enable('keks-plugin,keks-context');

  let alicePlugin;
  let bobPlugin;

  beforeEach(function () {
    // Same password for both sides
    const password = '123456'; // 6 chars → prefixed as in real app

    alicePlugin = new Plugin(password, 'alice');

    bobPlugin = new Plugin(password, 'bob');
    bobPlugin.name = 'bob';

    // Ensure fresh state
    alicePlugin.context.packet.fill(null);
    bobPlugin.context.packet.fill(null);
    alicePlugin.context.savedKey = null;
    bobPlugin.context.savedKey = null;
  });

  it('Alice and Bob should derive the same shared key after full exchange', function () {
    // Step 1: Alice starts (amConnected)
    alicePlugin.amConnected();
    bobPlugin.amConnected();

    // Alice asks Bob to start
    let aliceNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.Round1);
    expect(aliceNext[1]).to.be.null;

    // Round 1: Bob → Alice
    bobPlugin.receivedResponse(aliceNext[0]); // Bob gets command
    let bobNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.Round1);
    expect(bobNext[1]).to.not.be.null;
    alicePlugin.receivedData(bobNext[1]);

    // Round 1: Alice → Bob
    aliceNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.Round2);
    expect(aliceNext[1]).to.not.be.null;
    bobPlugin.receivedData(aliceNext[1]);

    // Round 2: Bob → Alice
    bobNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.Round2);
    expect(bobNext[1]).to.not.be.null;
    alicePlugin.receivedData(bobNext[1]);

    // Round 2: Alice → Bob
    aliceNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.Round3);
    expect(aliceNext[1]).to.not.be.null;
    bobPlugin.receivedData(aliceNext[1]);

    // Round 3: Bob → Alice
    bobNext = bobPlugin.aNext();
    expect(bobNext[1]).to.not.be.null;
    alicePlugin.receivedData(bobNext[1]);

    expect(alicePlugin.context.getRound3Packet()).to.not.be.null;
    expect(bobPlugin.context.getRound3Packet()).to.not.be.null;

    // Step 2: Both proceed to RequestAuth → ChallengeReply
    // Alice sends AuthRequest
    aliceNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.RequestAuth);

    // Bob receives AuthRequest and responds with challenge
    bobPlugin.receivedResponse(aliceNext[0]); // short message

    bobNext = bobPlugin.aNext(); // Bob sends AuthChallenge
    expect(bobPlugin.state).to.equal(Plugin.ChallengeReply);

    // Alice receives challenge and responds
    alicePlugin.receivedResponse(bobNext[0]);

    // Alice sends response (AuthChallengeTxMessage)
    aliceNext = alicePlugin.aNext();

    // Bob receives response and sends status
    bobPlugin.receivedResponse(aliceNext[0]);

    // Bob sends AuthStatus (authenticated + bonded)
    bobNext = bobPlugin.aNext();

    // Alice receives status
    alicePlugin.receivedResponse(bobNext[0]);

    // Both should now be authenticated and have a shared key
    const aliceKey = alicePlugin.getSharedKey();
    const bobKey = bobPlugin.getSharedKey();

    expect(aliceKey).to.be.a('Uint8Array');
    expect(bobKey).to.be.a('Uint8Array');
    expect(aliceKey.length).to.equal(16);
    expect(bobKey.length).to.equal(16);

    expect(Buffer.compare(aliceKey, bobKey)).to.equal(0);
    console.log('Shared key (hex):', aliceKey.toString('hex'));
  });
});
