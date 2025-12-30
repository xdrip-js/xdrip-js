// plugin.test.js
// Mocha tests for the KEKS Plugin state machine

const { expect } = require('chai');
const { JECPoint } = require('../lib/keks_plugin/jec-point');
const sinon = require('sinon');
const Plugin = require('../lib/keks_plugin/plugin');
const Context = require('../lib/keks_plugin/context');
const Calc = require('../lib/keks_plugin/calc');
const Config = require('../lib/keks_plugin/config');
const BlePacket = require('../lib/keks_plugin/ble-packet'); // Your 160-byte transport packet
const AuthRequestTxMessage2 = require('../lib/keks_plugin/auth-request-tx-message2');
const AuthChallengeTxMessage = require('../lib/messages/auth-challenge-tx-message');
const CertInfoRxMessage = require('../lib/keks_plugin/cert-info-rx-message');
const CertInfoTxMessage = require('../lib/keks_plugin/cert-info-tx-message');

describe('KEKS Plugin', function () {
  let plugin;
  let sandbox;
  let mockPacket;

  beforeEach(function () {
    sandbox = sinon.createSandbox();

    // Create a real EC instance and BN
    const { ec: EC } = require('elliptic');
    const ec = new EC('p256');
    const BN = ec.n.constructor;

    // Generate real private key BN
    const privBN = ec.genKeyPair().getPrivate(); // Real BN

    // Create plugin with password
    plugin = Plugin.getInstance('1234');

    plugin.context.challenge = Buffer.alloc(8, 0xAA);

    // Force password computation
    plugin.context.getPasswordBytes(); // Triggers prefix for 6-char

    // Optional: stub only round packets if needed
    mockPacket = {
      getHash: () => privBN,
      publicKeyPoint1: new JECPoint(ec.genKeyPair().getPublic()),
      publicKeyPoint2: new JECPoint(ec.genKeyPair().getPublic()),
      output: () => Buffer.alloc(160)
    };

    // Mock round packets
    sandbox.stub(plugin.context, 'getRound1Packet').returns(mockPacket);
    sandbox.stub(plugin.context, 'getRound2Packet').returns(mockPacket);

    // Don't stub calculateHash, getSharedKey, etc. — let real math run
    // Or if you want speed, stub only the final hash
    // sandbox.stub(Calc, 'calculateHash').returns(Buffer.alloc(8, 0xAA));
  });

  afterEach(function () {
    sandbox.restore();
    Plugin.instance = null; // Reset singleton
  });

  it('should be singleton with password binding', function () {
    const p1 = Plugin.getInstance('1234');
    const p2 = Plugin.getInstance('1234');
    const p3 = Plugin.getInstance('diff');

    expect(p1).to.equal(p2);
    expect(p1).to.not.equal(p3);
  });

  it('should start in RoundStart on connect', function () {
    plugin.amConnected();
    expect(plugin.state).to.equal(Plugin.RoundStart);
  });

  it('should progress through J-PAKE rounds via aNext()', function () {
    plugin.amConnected(); // → RoundStart

    plugin.context.savedKey = null;
    plugin.context.packet[3] = null; // Clear Round3 packet

    // RoundStart → Round1
    let next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.Round1);
    expect(next[0]).to.deep.equal(Buffer.from([0x0A, 0x00])); // KEYCMD + param 0
    expect(next[1]).to.be.null;

    // Round1 → Round2
    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.Round2);
    expect(next[0]).to.deep.equal(Buffer.from([0x0A, 0x01])); // param 1

    // Round2 → Round3
    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.Round3);
    expect(next[0]).to.deep.equal(Buffer.from([0x0A, 0x02])); // param 2

    plugin.context.packet[3] = mockPacket;

    // Round3 → RequestAuth
    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.RequestAuth);
    expect(next[0]).to.be.instanceof(Buffer); // AuthRequestTxMessage2
    expect(next[0][0]).to.equal(0x02); // AuthRequestTxMessage2 opcode
    expect(next[1]).to.have.length(160); // Round3 packet

    // RequestAuth → ChallengeReply
    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.ChallengeReply);
    expect(next[0]).to.be.instanceof(Buffer); // AuthChallengeTxMessage
    expect(next[1]).to.be.null;
  });

  it('should parse 160-byte packets via receivedData', function () {
    plugin.changeState(Plugin.Round1);

    sandbox.stub(BlePacket, 'parse').returns(mockPacket);
    sandbox.stub(plugin, 'validate').returns(true);

    const chunk1 = Buffer.alloc(100);
    const chunk2 = Buffer.alloc(60);

    let full = plugin.receivedData(chunk1);
    expect(full).to.be.false;

    full = plugin.receivedData(chunk2);
    expect(full).to.be.true;
    expect(plugin.context.packet[1]).to.equal(mockPacket);
  });

  it('should handle certificate flow', function () {
    plugin.context.setPartA(Buffer.alloc(150));
    plugin.context.setPartB(Buffer.alloc(150));

    plugin.changeState(Plugin.ChallengeReply);
    // Simulate authenticated + not bonded
    const statusData = Buffer.from([0x05, 0x01, 0x00]); // authenticated=1, bonded=0
    plugin.receivedResponse(statusData);

    expect(plugin.state).to.equal(Plugin.SendCertificate0);

    let next = plugin.aNext();
    expect(next[0]).to.deep.equal(CertInfoTxMessage.expectMyCert1(plugin));

    plugin.changeState(Plugin.SendCertificate1out);
    next = plugin.aNext();
    expect(next[0]).to.deep.equal(CertInfoTxMessage.expectMyCert2(plugin));
  });

  it('should parse CertInfoRxMessage and set expectedSize', function () {
    const certInfoData = Buffer.from([0x0b, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]); // size = 256
    plugin.changeState(Plugin.SendCertificate1);
    plugin.receivedResponse(certInfoData);

    const rep = new CertInfoRxMessage(certInfoData);

    expect(rep.valid()).to.be.true;
    expect(rep.getSize()).to.equal(256);
    expect(plugin.expectedSize).to.equal(256);
  });

  it('should throw on invalid certificate', function () {
    const invalidData = Buffer.from([0x0b, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]); // state != 0

    plugin.changeState(Plugin.SendCertificate1);

    expect(() => plugin.receivedResponse(invalidData)).to.throw('InvalidParameterException: Invalid QR code');
  });
});
