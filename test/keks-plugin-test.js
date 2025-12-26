// plugin.test.js
// Mocha tests for the KEKS Plugin state machine

const { expect } = require('chai');
const sinon = require('sinon');
const Plugin = require('../lib/keks_plugin/plugin');
const Context = require('../lib/keks_plugin/context');
const Calc = require('../lib/keks_plugin/calc');
const Config = require('../lib/keks_plugin/config');
const BlePacket = require('../lib/keks_plugin/ble-packet'); // Your 160-byte transport packet
const AuthRequestTxMessage2 = require('../lib/keks_plugin/auth-request-tx-message2');
const AuthChallengeTxMessage = require('../lib/keks_plugin/auth-challenge-tx-message');
const CertInfoRxMessage = require('../lib/keks_plugin/cert-info-rx-message');
const CertInfoTxMessage = require('../lib/keks_plugin/cert-info-tx-message');

describe('KEKS Plugin', function () {
  let plugin;
  let sandbox;

  beforeEach(function () {
    sandbox = sinon.createSandbox();
    plugin = Plugin.getInstance('123456'); // 6-char password → prefixed
    plugin.context.keyA = { getPublicKey: () => 'mockKeyA' };
    plugin.context.KeyB = { getPrivateKey: () => 'mockPrivB', getPublicKey: () => 'mockPubB' };
    //plugin.context.getPasswordBigInteger = () => 'mockPassBN';
  });

  afterEach(function () {
    sandbox.restore();
    Plugin.instance = null; // Reset singleton
  });

  it('should be singleton with password binding', function () {
    const p1 = Plugin.getInstance('123456');
    const p2 = Plugin.getInstance('123456');
    const p3 = Plugin.getInstance('different');

    expect(p1).to.equal(p2);
    expect(p1).to.not.equal(p3);
  });

  it('should start in RoundStart on connect', function () {
    plugin.amConnected();
    expect(plugin.state).to.equal(Plugin.RoundStart);
  });

  it('should progress through J-PAKE rounds via aNext()', function () {
    plugin.amConnected(); // → RoundStart

    // Mock round packets
    sandbox.stub(Calc, 'getRound1Packet').returns({ output: () => Buffer.alloc(160) });
    sandbox.stub(Calc, 'getRound2Packet').returns({ output: () => Buffer.alloc(160) });
    sandbox.stub(Calc, 'getRound3Packet').returns({ output: () => Buffer.alloc(160) });

    let next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.Round1);
    expect(next[0]).to.be.null; // command = KEYCMD + param
    expect(next[1]).to.have.length(160);

    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.Round2);

    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.Round3);

    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.RequestAuth);
  });

  it('should send AuthRequest and AuthChallenge', function () {
    plugin.changeState(Plugin.Round3);
    plugin.context.getRound3Packet = () => null;
    plugin.context.savedKey = null;

    let next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.RequestAuth);
    expect(next[0]).to.be.instanceof(Buffer);
    expect(next[0][0]).to.equal(0x02); // AuthRequestTxMessage2 opcode

    plugin.changeState(Plugin.RequestAuth);
    //sandbox.stub(Calc, 'calculateHash').returns(Buffer.alloc(8, 0xAA));

    next = plugin.aNext();
    expect(plugin.state).to.equal(Plugin.ChallengeReply);
    expect(next[0][0]).to.equal(0x04); // AuthChallengeTxMessage opcode
    expect(next[0].slice(1)).to.deep.equal(Buffer.alloc(8, 0xAA));
  });

  it('should parse 160-byte packets via receivedData', function () {
    plugin.changeState(Plugin.Round1);

    const mockPacket = BlePacket.parse(Buffer.alloc(160)); // valid parsed packet
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
    plugin.context.passwordBytes = Buffer.alloc(10); // >4 → GetData path

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
    const certInfoData = Buffer.from([0x0b, 0x00, 0x01, 0x00, 0x00, 0x01, 0x00]); // size = 256
    plugin.receivedResponse(certInfoData);

    const rep = new CertInfoRxMessage(certInfoData);
    expect(rep.valid()).to.be.true;
    expect(rep.getSize()).to.equal(256);
    expect(plugin.expectedSize).to.equal(256);
  });

  it('should throw on invalid certificate', function () {
    const invalidData = Buffer.from([0x0b, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00]); // state != 0
    expect(() => plugin.receivedResponse(invalidData)).to.throw('Invalid QR code');
  });
});
