// plugin.js
// JavaScript port of jamorham.keks.Plugin
// KEKS Bluetooth plugin state machine

const info = require('debug')('keks-plugin:info');
const debug = require('debug')('keks-plugin:debug');
const Context = require('./context');
const Calc = require('./calc');
const Curve = require('./curve');
const Config = require('./config');
const Util = require('./util');
const BLEPacket = require('./ble-packet'); // The 160-byte transport packet
const AuthRequestTxMessage2 = require('./auth-request-tx-message2');
const AuthChallengeTxMessage = require('./auth-challenge-tx-message');
const AuthStatusRxMessage = require('./auth-status-rx-message');
const CertInfoRxMessage = require('./cert-info-rx-message');
const CertInfoTxMessage = require('./cert-info-tx-message');
const SignChallengeTxMessage = require('./sign-challenge-tx-message');
const KeyPair = require('./keypair');

class Plugin {
  static stateToName(state) {
    switch (state) {
      case Plugin.Init: return 'Init';
      case Plugin.Unknown: return 'Unknown';
      case Plugin.Scanning: return 'Scanning';
      case Plugin.Connecting: return 'Connecting';
      case Plugin.RoundStart: return 'Round Start';
      case Plugin.Round1: return 'Round 1';
      case Plugin.Round2: return 'Round 2';
      case Plugin.Round3: return 'Round 3';
      case Plugin.BondFailure: return 'Bond Failure';
      case Plugin.Pairing: return 'Pairing';
      case Plugin.RequestAuth: return 'Request Auth';
      case Plugin.SendCertificate0: return 'Send Certificate 0';
      case Plugin.SendCertificate1: return 'Send Certificate 1';
      case Plugin.SendCertificate2: return 'Send Certificate 2';
      case Plugin.SendCertificate1out: return 'Send Certificate 1 Out';
      case Plugin.SendCertificate2out: return 'Send Certificate 2 Out';
      case Plugin.SendKeyChallenge: return 'Send Key Challenge';
      case Plugin.SendKeyChallengeOut: return 'Send Key Challenge Out';
      case Plugin.ChallengeReply: return 'Challenge Reply';
      case Plugin.GetData: return 'Get Data';
      case Plugin.GetData2: return 'Get Data 2';
      default: return `Error ${state}`;
    }
  }

  /**
   * Get singleton instance (with password binding)
   * @param {string} password
   * @returns {Plugin}
   */
  static getInstance(password) {
    if (!Plugin.instance || Plugin.instance.context.password !== password) {
      info('Creating new static instance');
      Plugin.instance = new Plugin(password);
      Plugin.instance.name = 'staticInstance';
    }
    return Plugin.instance;
  }

  constructor(password = null, role = 'alice') {
    this.context = new Context();
    if (password !== null) {
      this.context.password = password;
      this.context.getPasswordBytes(); // Pre-compute
    }

    this.name = role;

    if (role === 'alice') {
      info(`${this.name} is alice`);
      this.context.alice = Config.Get.ALICE;
      this.context.bob = Config.Get.BOB;
    } else {
      info(`${this.name} is bob`);
      this.context.alice = Config.Get.BOB;
      this.context.bob = Config.Get.ALICE;
    }

    this.context.role = role;

    this.context.keyA = KeyPair.generate();
    this.context.keyB = KeyPair.generate();

    this.state = Plugin.Init;
    this.accumulator = Buffer.alloc(0);
    this.newFwchal = Buffer.alloc(0);
    this.keyToTestAgainst = null;
    this.lastAuthTx2 = null;
    this.expectedSize = 0;
    this.presponse = null;
    this.alt = false;
  }

  changeState(newState) {
    info(`${this.name} Changing state: ${Plugin.stateToName(this.state)} -> ${Plugin.stateToName(newState)}`);
    if (!Plugin.dontClearAccumulator.has(newState)) {
      this.accumulator = Buffer.alloc(0);
    }
    this.state = newState;
  }

  // ——————————————————— IPluginDA interface ———————————————————

  amConnected() {
    this.context.resetIfNotReady();
    this.changeState(Plugin.RoundStart);
  }

  static bondNow(packet) {
    const te = Config.Get.TIME_EXTENDED;
    const te2 = Config.Get.TIME_EXTENDED2;
    const te3 = Config.Get.TIME_EXTENDED3;
    return Buffer.compare(packet, te) === 0
           || Buffer.compare(packet, te2) === 0
           || Buffer.compare(packet, te3) === 0;
  }

  positionFromState() {
    switch (this.state) {
      case Plugin.Round1: return 1;
      case Plugin.Round2: return 2;
      case Plugin.Round3: return 3;
      default: return 0;
    }
  }

  parameterFromState() {
    switch (this.state) {
      case Plugin.Round1: return 0;
      case Plugin.Round2: return 1;
      case Plugin.Round3: return 2;
      default: return -1;
    }
  }

  expectedBytesForState() {
    switch (this.state) {
      case Plugin.Round1:
      case Plugin.Round2:
      case Plugin.Round3:
        return Curve.PACKET_SIZE;
      case Plugin.SendCertificate1:
      case Plugin.SendCertificate1out:
      case Plugin.SendCertificate2:
      case Plugin.SendCertificate2out:
        return this.expectedSize > 0 ? this.expectedSize : 0x179005;
      case Plugin.SendKeyChallenge:
        return 64;
      default:
        return 0x602910;
    }
  }

  fill(data) {
    this.accumulator = Util.arrayAppend(this.accumulator, data);
    const expected = this.expectedBytesForState();
    return this.accumulator.length >= expected;
  }

  receivedData(data) {
    info(`${this.name} Received data stream(${data.length}B}`);
    debug(`${this.name} Received data stream(${data.length}B}: ${Util.bytesToHex(data)}`);
    const full = this.fill(data);
    if (full) {
      const parsed = BLEPacket.parse(this.accumulator);
      this.accumulator = Buffer.alloc(0);
      this.context.packet[this.positionFromState()] = parsed;

      if (!parsed || !this.validate()) {
        if (!parsed) {
          info(`${this.name} failed to parse data stream packet`);
        } else {
          info(`${this.name} failed to validate parsed data stream packet`);
        }

        this.context.packet[this.positionFromState()] = null;
        return false;
      }

      info(`${this.name} validated round${this.positionFromState()} packet in state ${Plugin.stateToName(this.state)}`);
    }
    return full;
  }

  /**
   * Handle non-data responses (e.g., challenge reply, status messages)
   * Called for short packets that are not part of the 160-byte stream
   */
  receivedResponse(data) {
    info(`${this.name} Received remote response: `
      + `${Util.bytesToHex(data)} when in ${Plugin.stateToName(this.state)}`);

    // Handle short KEYCMD commands (2 bytes: 0x0A + param)
    // This allows us to mimic the transmitter in alice-bob tests
    if (data.length === 2 && data[0] === Config.Get.KEYCMD[0]) {
      const param = data[1];
      info(`${this.name} Remote desires to start at Round${param + 1}`);
      if (param >= 0 && param <= 2) {
        // Remote side is starting round param+1
        // this.changeState(Plugin.Round1);
        return true; // Consume the command
      }
    }

    switch (this.state) {
      case Plugin.RequestAuth:
        if (!this.verifyChallenge(data)) {
          this.context.reset();
          if (this.context.sequence > 1) {
            throw new Error('SecurityException: Mismatch - wait');
          }
          return false;
        }

        // Extract 8-byte challenge starting at offset 9
        this.context.challenge = data.slice(9, 17);
        return true;

      case Plugin.ChallengeReply: {
        const status = new AuthStatusRxMessage(data);

        if (status.needsRefresh()) {
          this.context.reset();
        }

        if (!status.isAuthenticated()) {
          info(`${this.name} Could not authenticate!`);
          this.context.reset();

          if (!status.isBonded()) {
            this.changeState(Plugin.BondFailure);
          } else {
            this.changeState(Plugin.Unknown);
          }
          return true;
        }

        // Authenticated!
        if (status.isBonded()) {
          info(`${this.name} Full success`);
          if (this.context.passwordBytes.length > 4) {
            this.changeState(Plugin.GetData);
          } else {
            this.changeState(Plugin.GetData2);
          }
        } else {
          // Not bonded yet → go to pairing/certificate flow
          this.expectedSize = 0;
          this.presponse = null;

          if (this.context.passwordBytes.length > 4) {
            this.changeState(Plugin.Pairing);
          } else if (this.context.validateParts()) {
            this.changeState(Plugin.SendCertificate0);
          } else {
            throw new Error('InvalidParameterException: Missing QR code');
          }
        }
        return true;
      }

      case Plugin.Pairing:
        return true;

      case Plugin.SendCertificate1:
      case Plugin.SendCertificate2: {
        const rep = new CertInfoRxMessage(data);
        if (rep.valid()) {
          this.expectedSize = rep.getSize();
          // Continue to next state
          this.changeState(this.state);
          return true;
        }

        throw new Error('InvalidParameterException: Invalid QR code');
      }

      case Plugin.SendKeyChallenge:
        if (data.length > 2 && data[1] !== 0) {
          throw new Error('InvalidParameterException: Invalid QR code 3');
        }
        this.presponse = Calc.challenger(this.context.getPartC(), data);
        return true;

      case Plugin.SendKeyChallengeOut:
        return true;

      default:
        return false;
    }
  }

  /**
   * Verify the challenge response from the transmitter during RequestAuth
   * @param {Buffer} data - Full response packet
   * @returns {boolean}
   */
  verifyChallenge(data) {
    if (this.context.savedKey != null) {
      return true; // Already have a key → skip verification
    }

    // Use the singleUseToken from the last AuthRequestTxMessage2 we sent
    this.context.challenge = this.lastAuthTx2.singleUseToken;

    const h = Calc.calculateHash(this.context);
    if (!h) return false;

    // Compare first 8 bytes of response (starting at index 1) with our calculated hash
    for (let i = 0; i < 8; i += 1) {
      if (h[i] !== data[i + 1]) {
        return false;
      }
    }

    return true;
  }

  static receivedData2() { return false; }

  static receivedData3() { return false; }

  getAuthRequestTx2() {
    this.lastAuthTx2 = new AuthRequestTxMessage2(8, this.alt, this.newFwchal);
    return this.lastAuthTx2;
  }

  aNext() {
    info(`${this.name} Processing aNext in state: ${Plugin.stateToName(this.state)}`);

    switch (this.state) {
      case Plugin.RoundStart:
        if (this.context.getRound3Packet() != null || this.context.savedKey != null) {
          this.changeState(Plugin.RequestAuth);
          return [this.getAuthRequestTx2().byteSequence, null];
        }

        this.changeState(Plugin.Round1);

        if (this.name === 'bob') {
          info(`${this.name} sending round1 packet`);
          return this.sequencePacket(Calc.getRound1Packet(this.context));
        }

        info(`${this.name} sending request to start packet`);
        return this.sequencePacket(null);

      case Plugin.Round1: {
        this.changeState(Plugin.Round2);

        if (this.name === 'bob') {
          info(`${this.name} sending round2 packet`);
          return this.sequencePacket(Calc.getRound2Packet(this.context));
        }

        info(`${this.name} sending round1 packet`);
        return this.sequencePacket(Calc.getRound1Packet(this.context));
      }

      case Plugin.Round2:
        this.changeState(Plugin.Round3);

        if (this.name === 'bob') {
          info(`${this.name} sending round3 packet`);
          return [
            this.getAuthRequestTx2().byteSequence,
            Calc.getRound3Packet(this.context).output(),
          ];
        }

        info(`${this.name} sending round2 packet`);
        return this.sequencePacket(Calc.getRound2Packet(this.context));

      case Plugin.Round3:
        this.changeState(Plugin.RequestAuth);
        return [
          this.getAuthRequestTx2().byteSequence,
          Calc.getRound3Packet(this.context).output(),
        ];

      case Plugin.RequestAuth: {
        const challengeHash = Calc.calculateHash(this.context);
        const authChallengeMsg = challengeHash ? new AuthChallengeTxMessage(challengeHash) : null;
        this.changeState(Plugin.ChallengeReply);
        return [authChallengeMsg.byteSequence, null];
      }

      case Plugin.ChallengeReply:
        this.changeState(Plugin.Unknown);
        return [Config.Get.TIME_EXTENDED, null];

      case Plugin.SendCertificate0:
        this.changeState(Plugin.SendCertificate1);
        return [CertInfoTxMessage.expectMyCert1(this), null];

      case Plugin.SendCertificate1:
        this.changeState(Plugin.SendCertificate1out);
        return [null, this.context.getPartA()];

      case Plugin.SendCertificate1out:
        this.changeState(Plugin.SendCertificate2);
        return [CertInfoTxMessage.expectMyCert2(this), null];

      case Plugin.SendCertificate2:
        this.changeState(Plugin.SendCertificate2out);
        return [null, this.context.getPartB()];

      case Plugin.SendCertificate2out: {
        const signMsg = SignChallengeTxMessage.createDefault(); // default random challenge
        this.changeState(Plugin.SendKeyChallenge);
        return [signMsg.byteSequence, null];
      }

      case Plugin.SendKeyChallenge:
        this.changeState(Plugin.SendKeyChallengeOut);
        return [Config.Get.CHALLENGE_OUT, this.presponse];

      case Plugin.SendKeyChallengeOut:
        this.changeState(Plugin.GetData);
        return [Config.Get.TIME_EXTENDED, null];

      case Plugin.Pairing:
        this.changeState(Plugin.GetData);
        return [Config.Get.TIME_EXTENDED, null];

      case Plugin.GetData:
        this.changeState(Plugin.Unknown);
        return [Config.Get.GETDATA];

      case Plugin.GetData2:
        this.changeState(Plugin.Unknown);
        return [Config.Get.GETDATA2];

      case Plugin.BondFailure:
        this.changeState(Plugin.Unknown);
        return [Config.Get.GETDATA, null, null];

      default:
        return null;
    }
  }

  static bNext() {
    return [];
  }

  static cNext() {
    return [];
  }

  getPersistence(channel) {
    if (channel === 1) {
      const key = this.getSharedKey();
      return key || Buffer.alloc(0);
    }
    if (channel === 3) {
      if (this.keyToTestAgainst && this.getSharedKey()
        && Buffer.compare(this.getSharedKey(), this.keyToTestAgainst) === 0) {
        return Buffer.alloc(0);
      }
      return null;
    }
    return Buffer.alloc(0);
  }

  setPersistence(channel, data) {
    if (channel === 1) {
      this.keyToTestAgainst = data;
      return true;
    }
    if (channel === 2) {
      if (data && data.length !== 16) return false;
      if (!this.context.savedKey) {
        info(`${this.name} Updating saved key from loaded persistence data`);
        this.context.savedKey = data;
        return true;
      }
      return false;
    }
    if (channel === 3 || channel === 4) {
      Plugin.instance = null; // Reset singleton
      return true;
    }

    if (channel === 6) {
      this.alt = Buffer.isBuffer(data) && Buffer.compare(data, Config.Get.SPARAM) === 0;
      this.newFwchal = data || Buffer.alloc(0);
      return true;
    }

    if (channel === 7) {
      Plugin.dontClearAccumulator.clear();
      return true;
    }

    if (channel === 8) {
      this.context.setPartA(data);
      return true;
    }

    if (channel === 9) {
      this.context.setPartB(data);
      return true;
    }

    if (channel === 10) {
      this.context.setPartC(data);
      return true;
    }

    return false;
  }

  static getStatus() { return ''; }

  static getName() { return 'keks'; }

  validate() {
    switch (this.state) {
      case Plugin.Round1: return Calc.validateRound1PacketContext(this.context);
      case Plugin.Round2: return Calc.validateRound2PacketContext(this.context);
      case Plugin.Round3: return Calc.validateRound3Packet(this.context);
      case Plugin.SendCertificate1out:
      case Plugin.SendCertificate2out:
        return true;
      default:
        info(`${this.name} Invalid state for validation: ${Plugin.stateToName(this.state)}`);
        return false;
    }
  }

  getSharedKey() {
    if (!this.context.savedKey) {
      this.context.savedKey = Calc.getShortSharedKey(this.context);
    }
    return this.context.savedKey;
  }

  sequencePacket(packetObj) {
    this.context.sequence += 1;
    const param = this.parameterFromState();
    const command = param < 0 ? null : Buffer.from([Config.Get.KEYCMD[0], param]);

    let packetBytes = null;
    if (packetObj) {
      packetBytes = new BLEPacket(
        packetObj.hash,
        packetObj.publicKeyPoint1,
        packetObj.publicKeyPoint2,
      ).output();
    }

    return [command, packetBytes];
  }
}

// State constants (exact match to Java)
Plugin.instance = null;
Plugin.Init = 0;
Plugin.Unknown = 370018;
Plugin.Scanning = 448130;
Plugin.Connecting = 432753;
Plugin.RoundStart = 789035;
Plugin.Pairing = 804167;
Plugin.Round1 = 674667;
Plugin.Round2 = 189857;
Plugin.Round3 = 588648;
Plugin.BondFailure = 162087;
Plugin.RequestAuth = 125320;
Plugin.ChallengeReply = 766662;
Plugin.SendCertificate0 = 975913;
Plugin.SendCertificate1 = 694702;
Plugin.SendCertificate2 = 230995;
Plugin.SendCertificate1out = 842681;
Plugin.SendCertificate2out = 558830;
Plugin.SendKeyChallenge = 486262;
Plugin.SendKeyChallengeOut = 327604;
Plugin.GetData = 734275;
Plugin.GetData2 = 199434;
Plugin.dontClearAccumulator = new Set([
  Plugin.SendCertificate1,
  Plugin.SendCertificate1out,
  Plugin.SendCertificate2,
  Plugin.SendCertificate2out,
]);

module.exports = Plugin;
