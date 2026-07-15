// alice-bob-shared-key.test.js
// Full Alice/Bob J-PAKE simulation test
// Verifies both sides derive the same shared key

const { expect } = require('chai');
const debug = require('debug');
const Plugin = require('../lib/keks_plugin/plugin');
const BlePacket = require('../lib/keks_plugin/ble-packet'); // Your 160-byte transport packet
const Config = require('../lib/keks_plugin/config');
const Calc = require('../lib/keks_plugin/calc');
const Curve = require('../lib/keks_plugin/curve');
const AuthStatusRxMessage = require('../lib/messages/auth-status-rx-message');
const AuthChallengeRxMessage = require('../lib/messages/auth-challenge-rx-message');

describe('KEKS J-PAKE: Alice and Bob shared key equality', function () {
  this.timeout(10000); // Crypto can be slow in tests
  // debug.enable('keks-plugin:*,keks-context,keks-calc');

  let bobPlugin;
  let alicePlugin;

  beforeEach(() => {
    // Same password for both sides
    const password = '1235'; // 6 chars → prefixed as in real app

    alicePlugin = new Plugin(
      password,
      'alice',
      '2e0ccbb6b93f04a17951278a0907a6b3796d616c1bb61e97e967e3aa3647d61b',
      '601638dcc1dfc73375c994693c8a9797433a2b14691ea55f2297ce94afe8c74f',
      'e805590af85eee6cdc784486127a6e234912a0f5727b50c981fce8d59dc5340c',
    );

    bobPlugin = new Plugin(
      password,
      'bob',
      'e349cd5d8d3f587bc3f5ce2301f36a3f412102fc069deabd96273665fb52ba75',
      '87357c1da8746e4db99c114a2f250f8179d6da3517dd15ef7693fa02365c3538',
      'c22afca430464def5e0a64252bdcfb0c516bc1f0d3c3e693fee90d0673750dac',
    );

    // Ensure fresh state
    bobPlugin.context.packet.fill(null);
    alicePlugin.context.packet.fill(null);
    bobPlugin.context.savedKey = null;
    alicePlugin.context.savedKey = null;
  });

  it('Alice and Bob should derive the same shared key after full exchange', () => {
    // Alice starts (amConnected)
    bobPlugin.amConnected();

    // Bob needs to start at Round1
    alicePlugin.amConnected();

    // Bob asks Alice to start
    let aliceNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.Round1);
    expect(aliceNext[1]).to.be.null;

    alicePlugin.receivedResponse(aliceNext[0]); // Alice gets command
    alicePlugin.changeState(Plugin.Round1);

    // Round 1: Alice → Bob
    let bobNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.Round2);
    expect(bobNext[1]).to.not.be.null;
    bobPlugin.receivedData(bobNext[1]);

    // Round 1: Bob → Alice
    aliceNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.Round2);
    expect(aliceNext[1]).to.not.be.null;

    // plugin only intended to work for Bob
    // have to change Alice's state back to Round1 for it to receive Bob's round1 packet
    alicePlugin.changeState(Plugin.Round1);
    alicePlugin.receivedData(aliceNext[1]);
    alicePlugin.changeState(Plugin.Round2);

    // Round 2: Alice → Bob
    bobNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.Round3);
    expect(bobNext[1]).to.not.be.null;
    bobPlugin.receivedData(bobNext[1]);

    // Round 2: Bob → Alice
    aliceNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.Round3);
    expect(aliceNext[1]).to.not.be.null;

    // have to change Alice's state back to Round2 for it to receive Bob's round2 packet
    alicePlugin.changeState(Plugin.Round2);
    alicePlugin.receivedData(aliceNext[1]);
    alicePlugin.changeState(Plugin.Round3);

    // Round 3: Alice → Bob
    bobNext = alicePlugin.aNext();
    expect(alicePlugin.state).to.equal(Plugin.RequestAuth);
    expect(bobNext[1]).to.not.be.null;
    bobPlugin.receivedData(bobNext[1]);

    // Round 3: Bob → Alice
    aliceNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.RequestAuth);
    expect(aliceNext[1]).to.not.be.null;

    // have to change Alice's state back to Round3 for it to receive Bob's round3 packet
    alicePlugin.changeState(Plugin.Round3);
    alicePlugin.receivedData(aliceNext[1]);
    alicePlugin.changeState(Plugin.RequestAuth);

    expect(bobPlugin.context.getRound3Packet()).to.not.be.null;
    expect(alicePlugin.context.getRound3Packet()).to.not.be.null;

    // Step 2: Both proceed to RequestAuth → ChallengeReply
    // Alice sends AuthRequest (already in aliceNext from Round3)
    alicePlugin.receivedResponse(aliceNext[0]);
    bobNext = alicePlugin.aNext();
    const bobChallengeReply = Buffer.concat([bobNext[0], alicePlugin.lastAuthTx2.singleUseToken]);
    bobChallengeReply[0] = AuthChallengeRxMessage.opcode;
    bobPlugin.receivedResponse(bobChallengeReply);
    aliceNext = bobPlugin.aNext();
    expect(bobPlugin.state).to.equal(Plugin.ChallengeReply);

    // Bob will only stored the challenge from Alice if Alice's challenge was response was authenticated
    expect(Buffer.compare(bobPlugin.context.challenge, alicePlugin.lastAuthTx2.singleUseToken)).to.equal(0);

    // Both should now be authenticated and have a shared key
    const aliceKey = bobPlugin.getSharedKey();
    const bobKey = alicePlugin.getSharedKey();

    expect(aliceKey).to.be.a('Uint8Array');
    expect(bobKey).to.be.a('Uint8Array');
    expect(aliceKey.length).to.equal(16);
    expect(bobKey.length).to.equal(16);

    expect(Buffer.compare(aliceKey, bobKey)).to.equal(0);

    // send Bob a AuthStatusRxMessage
    const authStatusRxMessageBytes = Buffer.from([0x05, 0x01, 0x00]);
    bobPlugin.receivedResponse(authStatusRxMessageBytes);
    expect(bobPlugin.state).to.equal(Plugin.SendCertificate0);
  });

  after(() => {
    Curve.clearFixedExponent();
  });
});
