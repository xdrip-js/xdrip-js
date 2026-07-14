// plugin.test.js
// Mocha tests for the KEKS Plugin state machine

const { expect } = require('chai');
const sinon = require('sinon');
const debug = require('debug');
const { JECPoint } = require('../lib/keks_plugin/jec-point');
const Plugin = require('../lib/keks_plugin/plugin');
const Context = require('../lib/keks_plugin/context');
const Calc = require('../lib/keks_plugin/calc');
const KeyPair = require('../lib/keks_plugin/keypair');
const Config = require('../lib/keks_plugin/config');
const Util = require('../lib/keks_plugin/util');
const BlePacket = require('../lib/keks_plugin/ble-packet'); // Your 160-byte transport packet
const AuthRequestTxMessage2 = require('../lib/keks_plugin/auth-request-tx-message2');
const AuthChallengeTxMessage = require('../lib/messages/auth-challenge-tx-message');
const CertInfoRxMessage = require('../lib/keks_plugin/cert-info-rx-message');
const CertInfoTxMessage = require('../lib/keks_plugin/cert-info-tx-message');

describe('KEKS Plugin', () => {
  let plugin;
  let sandbox;
  let mockPacket;

  // debug.enable('keks-plugin:*,keks-context,keks-calc');

  beforeEach(() => {
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
      output: () => Buffer.alloc(160),
    };

    // Mock round packets
    sandbox.stub(plugin.context, 'getRound1Packet').returns(mockPacket);
    sandbox.stub(plugin.context, 'getRound2Packet').returns(mockPacket);

    // Don't stub calculateHash, getSharedKey, etc. — let real math run
    // Or if you want speed, stub only the final hash
    // sandbox.stub(Calc, 'calculateHash').returns(Buffer.alloc(8, 0xAA));
  });

  afterEach(() => {
    sandbox.restore();
    Plugin.instance = null; // Reset singleton
  });

  it('should be singleton with password binding', () => {
    const p1 = Plugin.getInstance('1234');
    const p2 = Plugin.getInstance('1234');
    const p3 = Plugin.getInstance('diff');

    expect(p1).to.equal(p2);
    expect(p1).to.not.equal(p3);
  });

  it('should start in RoundStart on connect', () => {
    plugin.amConnected();
    expect(plugin.state).to.equal(Plugin.RoundStart);
  });

  it('should parse 160-byte packets via receivedData', () => {
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

  it('should handle certificate flow', () => {
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

  it('should create key challenge response', () => {
    const challengeMsg = Util.hexStringToByteArray('0c002c31dc58ceb0a3ea59d37d18225699a9', false);
    const response = Calc.challenger(plugin.context.getPartC(), challengeMsg);

    expect(response.length).to.equal(64);
  });

  it('should parse CertInfoRxMessage and set expectedSize', () => {
    const certInfoData = Buffer.from([0x0b, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00]); // size = 256
    plugin.changeState(Plugin.SendCertificate1);
    plugin.receivedResponse(certInfoData);

    const rep = new CertInfoRxMessage(certInfoData);

    expect(rep.valid()).to.be.true;
    expect(rep.getSize()).to.equal(256);
    expect(plugin.expectedSize).to.equal(256);
  });

  it('should throw on invalid certificate', () => {
    const invalidData = Buffer.from([0x0b, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]); // state != 0

    plugin.changeState(Plugin.SendCertificate1);

    expect(() => plugin.receivedResponse(invalidData)).to.throw('InvalidParameterException: Invalid QR code');
  });
});
