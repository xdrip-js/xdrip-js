// plugin.js
// JavaScript port of jamorham.keks.Plugin
// KEKS Bluetooth plugin state machine

// initial commit for xDrip+ which supported Dexcom ONE transmitters:
//    github.com/NightscoutFoundation/xDrip/commit/a2d1e61
// initial commit for G7 transmitters:
//    github.com/NightscoutFoundation/xDrip/commit/75d8671
//    G7 transmitters have a BlueTooth device name like DXCMKA and a 4 digit pairing ID like 1249

const info = require('debug')('keks-plugin:info');
const debug = require('debug')('keks-plugin:debug');
const Context = require('./context');
const Calc = require('./calc');
const Curve = require('./curve');
const Config = require('./config');
const Util = require('./util');
const BLEPacket = require('./ble-packet'); // The 160-byte transport packet
const AuthChallengeTxMessage = require('../messages/auth-challenge-tx-message');
const AuthChallengeRxMessage = require('../messages/auth-challenge-rx-message');
const AuthRequestTxMessageG7 = require('../messages/auth-request-tx-message-g7');
const AuthStatusRxMessage = require('../messages/auth-status-rx-message');
const CertInfoRxMessage = require('../messages/cert-info-rx-message');
const CertInfoTxMessage = require('../messages/cert-info-tx-message');
const SignChallengeTxMessage = require('../messages/sign-challenge-tx-message');
const KeyPair = require('./keypair');

class Plugin {
  static stateToName(state) {
    switch (state) {
      case Plugin.Init: return 'Init';
      case Plugin.Unknown: return 'Unknown';
      case Plugin.Scanning: return 'Scanning';
      case Plugin.Connecting: return 'Connecting';
      case Plugin.RoundStart: return 'RoundStart';
      case Plugin.Round1: return 'Round1';
      case Plugin.Round2: return 'Round2';
      case Plugin.Round3: return 'Round3';
      case Plugin.BondFailure: return 'BondFailure';
      case Plugin.Pairing: return 'Pairing';
      case Plugin.RequestAuth: return 'RequestAuth';
      case Plugin.SendCertificate0: return 'SendCertificate0';
      case Plugin.SendCertificate1: return 'SendCertificate1';
      case Plugin.SendCertificate2: return 'SendCertificate2';
      case Plugin.SendCertificate1out: return 'SendCertificate1Out';
      case Plugin.SendCertificate2out: return 'SendCertificate2Out';
      case Plugin.SendKeyChallenge: return 'SendKeyChallenge';
      case Plugin.SendKeyChallengeOut: return 'SendKeyChallengeOut';
      case Plugin.ChallengeReply: return 'ChallengeReply';
      case Plugin.GetData: return 'GetData';
      case Plugin.GetData2: return 'GetData2';
      default: return `Error ${state}`;
    }
  }

  /**
   * Get singleton instance (with password binding)
   * @param {string} password
   * @returns {Plugin}
   */
  static getInstance(password) {
    info('Getting keks plugin static instance');
    if (!Plugin.instance || Plugin.instance.context.password !== password) {
      info('Creating new keks plugin static instance');
      Plugin.instance = new Plugin(password);
    }
    return Plugin.instance;
  }

  constructor(password = null, role = 'bob', keyA = null, keyB = null, exponent = null) {
    this.context = new Context();
    if (password !== null) {
      this.context.password = password;
      this.context.getPasswordBytes(); // Pre-compute
    }

    this.name = role;

    this.context.alice = Config.Get.ALICE;
    this.context.bob = Config.Get.BOB;

    info(`this plug instance is ${this.name}`);
    this.context.role = role;
    info(`context.alice = ${this.context.alice}`);
    info(`context.bob = ${this.context.bob}`);

    if (keyA !== null) {
      this.context.keyA = KeyPair.fromPrivateBytes(Util.hexStringToByteArray(keyA));
    } else {
      this.context.keyA = KeyPair.generate();
    }

    if (keyB !== null) {
      this.context.keyB = KeyPair.fromPrivateBytes(Util.hexStringToByteArray(keyB));
    } else {
      this.context.keyB = KeyPair.generate();
    }

    debug(`keyA private (hex): ${this.context.keyA.getPrivateKey().toString('hex')}`);
    debug(`keyB private (hex): ${this.context.keyB.getPrivateKey().toString('hex')}`);

    if (exponent !== null) {
      Curve.setFixedExponent(Util.hexStringToByteArray(exponent));
    }

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
    const expectedBytes = this.expectedBytesForState();
    const haveBytes = this.accumulator.length;

    info(`${this.name} Received data (${data.length}B} in state ${Plugin.stateToName(this.state)}`);
    debug(`${this.name} Total ${expectedBytes}B needed - have ${haveBytes}B + ${data.length}B = ${haveBytes + data.length}B`);
    const full = this.fill(data);
    if (full) {
      debug(`${this.name} Received ExtraData ${this.accumulator.length}B: ${Util.bytesToHex(this.accumulator)}`);

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
    info(`${this.name} Received response in ${Plugin.stateToName(this.state)}`);
    debug(`${this.name} Received response data(${data.length}B): ${Util.bytesToHex(data)} `);

    if (Buffer.compare(data, Config.Get.TIME_EXTENDED4) === 0) {
      debug(`${this.name} Ignoring response data(${data.length}B): ${Util.bytesToHex(data)} `);
      return false;
    }

    switch (this.state) {
      case Plugin.RoundStart:
        // Handle KEYCMD commands
        // This allows us to mimic the transmitter in alice-bob tests
        if (this.name === 'alice' && data.length === 2 && data[0] === Config.Get.KEYCMD[0]) {
          const param = data[1];
          info(`${this.name} Remote desires to start at Round${param + 1}`);
          if (param >= 0 && param <= 2) {
            // Remote side is starting round param+1
            return true; // Consume the command
          }
        }
        return false;

      case Plugin.RequestAuth:
        // this stub allows us to save the challenge when this plugin
        // is simulating the transmitter for module tests
        // TODO: actually received this from the transmitter... should respond
        if (this.name === 'alice' && data[0] === AuthRequestTxMessageG7.opcode) {
          this.context.challenge = data.slice(1, 9); // Take first tokenSize bytes
          info(`${this.name} received challenge: ${Util.bytesToHex(this.context.challenge)}`);
          return false;
        }

        if (((Date.now() - this.requestAuthTime) > 1000)
          && (Buffer.compare(data, Config.Get.TIME_EXTENDED4) === 0)) {
          info(`${this.name} stuck in RequestAuth - sending again`);
          return true;
        }

        if (data[0] === AuthChallengeRxMessage.opcode) {
          const authResponse = new AuthChallengeRxMessage(data);

          if (!this.verifyChallenge(authResponse.tokenHash)) {
            info(`${this.name} failed to verify challenge data: ${Util.bytesToHex(data)}`);
            this.context.reset();
            if (this.context.sequence > 1) {
              throw new Error('SecurityException: Mismatch - wait');
            }
            return false;
          }

          info(`${this.name} verified challenge data: ${Util.bytesToHex(data)}`);
          this.context.challenge = authResponse.challenge;
          return true;
        }

        return false;

      case Plugin.ChallengeReply: {
        if (data[0] !== AuthStatusRxMessage.opcode) {
          return false;
        }

        const status = new AuthStatusRxMessage(data);

        if (status.needsRefresh()) {
          info(`${this.name} needs refresh - resetting context!`);
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
        if (data[0] !== CertInfoRxMessage.opcode) {
          return false;
        }

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
        // Transmitter first sends a response back to our challenge
        // by sending us a copy of our SignChallengeTxMessage back
        // along with the challenge response via ExtraData

        // When the Transmitter wants us to respond to its challenge
        // the secod byte of the message is set to 0
        if (data.length > 2 && data[1] === 0) {
          info(`${this.name} calculating presponse for cert challenge ${Util.bytesToHex(data)}`);
          info(`${this.name} TODO: put better validation check for this code block`);
          this.presponse = Calc.challenger(this.context.getPartC(), data);

          return true;
        }

        return false;

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
    // Use the singleUseToken from the last AuthRequestTxMessageG7 we sent
    this.context.challenge = this.lastAuthTx2.singleUseToken;

    const h = Calc.calculateHash(this.context);
    if (!h) {
      debug('Unable to calculate hash of saved challenge');
      return false;
    }

    info(`${this.name} verifying challenge hash ${Util.bytesToHex(h)} === ${Util.bytesToHex(data)}`);

    // Compare with our calculated hash
    for (let i = 0; i < 8; i += 1) {
      if (h[i] !== data[i]) {
        return false;
      }
    }

    return true;
  }

  receivedData2() {
    info(`${this.name} Received data 2 called`);
    return false;
  }

  receivedData3() {
    info(`${this.name} Received data 3 called`);
    return false;
  }

  getAuthRequestTxG7() {
    info(`${this.name} creating AuthRequestTxMessageG7 - altBtChannel=${this.alt}`);
    this.lastAuthTx2 = AuthRequestTxMessageG7.create(8, this.alt, this.newFwchal);
    return this.lastAuthTx2;
  }

  aNext() {
    info(`${this.name} Processing aNext in state: ${Plugin.stateToName(this.state)}`);

    switch (this.state) {
      case Plugin.RoundStart:
        if (this.getSharedKey()) {
          this.changeState(Plugin.RequestAuth);

          info(`${this.name} sending getAuthRequestTxG7 to start Round`);
          this.requestAuthTime = Date.now();
          return [this.getAuthRequestTxG7().byteSequence, null];
        }

        this.changeState(Plugin.Round1);

        info(`${this.name} sending request to start packet`);
        return this.sequencePacket(null);

      case Plugin.Round1: {
        this.changeState(Plugin.Round2);

        info(`${this.name} sending round1 packet`);
        return this.sequencePacket(Calc.getRound1Packet(this.context));
      }

      case Plugin.Round2: {
        this.changeState(Plugin.Round3);

        const round2Packet = Calc.getRound2Packet(this.context);
        const round2PacketBytes = round2Packet ? round2Packet.output() : null;

        info(`${this.name} sending round2 packet`);
        debug(`${this.name}         round2 packet ${Util.bytesToHex(round2PacketBytes)}`);

        return this.sequencePacket(round2Packet);
      }

      case Plugin.Round3: {
        this.changeState(Plugin.RequestAuth);

        const authRequestTx2 = this.getAuthRequestTxG7().byteSequence;
        this.requestAuthTime = Date.now();
        const round3Packet = Calc.getRound3Packet(this.context);
        const round3PacketBytes = round3Packet ? round3Packet.output() : null;

        info(`${this.name} sending auth-request-tx2 and round3 packet`);
        debug(`${this.name} auth-request-tx2 ${Util.bytesToHex(authRequestTx2)}`);
        debug(`${this.name}           round3 ${Util.bytesToHex(round3PacketBytes)}`);
        return [
          authRequestTx2,
          round3PacketBytes,
        ];
      }

      case Plugin.RequestAuth: {
        if (this.context.challenge?.length > 5) {
          // challenge message arrived if context.challenge has data
          const challengeHash = Calc.calculateHash(this.context);
          const authChallengeMsg = challengeHash ? new AuthChallengeTxMessage(challengeHash) : null;
          this.changeState(Plugin.ChallengeReply);

          info(`${this.name} sending auth-challenge packet ${Util.bytesToHex(authChallengeMsg.data)}`);

          return [authChallengeMsg.data, null];
        }

        if ((Date.now() - this.requestAuthTime) > 1000) {
          info(`${this.name} stuck in RequestAuth - sending again`);

          return [this.getAuthRequestTxG7().byteSequence, null];
        }

        return false;
      }

      case Plugin.ChallengeReply:
        this.changeState(Plugin.Unknown);
        info(`${this.name} sending TIME_EXTENDED message`);

        return [Config.Get.TIME_EXTENDED, null];

      case Plugin.SendCertificate0:
        this.changeState(Plugin.SendCertificate1);

        info(`${this.name} sending Certificate 1`);
        return [CertInfoTxMessage.expectMyCert1(this), null];

      case Plugin.SendCertificate1:
        this.changeState(Plugin.SendCertificate1out);

        return [null, this.context.getPartA()];

      case Plugin.SendCertificate1out:
        this.changeState(Plugin.SendCertificate2);

        info(`${this.name} sending Certificate 2`);
        return [CertInfoTxMessage.expectMyCert2(this), null];

      case Plugin.SendCertificate2:
        this.changeState(Plugin.SendCertificate2out);
        return [null, this.context.getPartB()];

      case Plugin.SendCertificate2out: {
        const signMsg = SignChallengeTxMessage.createDefault(); // default random challenge
        this.changeState(Plugin.SendKeyChallenge);

        info(`${this.name} sending Key Challenge`);
        return [signMsg.byteSequence, null];
      }

      case Plugin.SendKeyChallenge:
        this.changeState(Plugin.SendKeyChallengeOut);

        info(`${this.name} sending Key Challenge Response`);
        return [Config.Get.CHALLENGE_OUT, this.presponse];

      case Plugin.SendKeyChallengeOut:
        this.changeState(Plugin.GetData);

        info(`${this.name} sending TIME_EXTENDED message`);
        return [Config.Get.TIME_EXTENDED, null];

      case Plugin.Pairing:
        this.changeState(Plugin.GetData);

        info(`${this.name} sending TIME_EXTENDED message`);
        return [Config.Get.TIME_EXTENDED, null];

      case Plugin.GetData:
        this.changeState(Plugin.Unknown);

        info(`${this.name} sending GETDATA message`);
        return [Config.Get.GETDATA];

      case Plugin.GetData2:
        this.changeState(Plugin.Unknown);

        info(`${this.name} sending GETDATA2 message`);
        return [Config.Get.GETDATA2];

      case Plugin.BondFailure:
        this.changeState(Plugin.Round1);

        info(`${this.name} BondFailure: sending request to start packet`);
        return this.sequencePacket(null);

      default:
        return null;
    }
  }

  bNext() {
    info(`${this.name} bNext called`);
    return [];
  }

  cNext() {
    info(`${this.name} cNext called`);
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
      if (data && data.length !== 32) {
        info(`${this.name} invalid saved key received from loaded persistence data ${data}`);
        return false;
      }
      if (!this.getSharedKey()) {
        info(`${this.name} Updating saved key from loaded persistence data`);
        this.context.savedKey = Util.hexStringToByteArray(data);
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
      info(`${this.name} setting PartA from loaded persistence data`);
      this.context.setPartA(data);
      return true;
    }

    if (channel === 9) {
      info(`${this.name} setting PartB from loaded persistence data`);
      this.context.setPartB(data);
      return true;
    }

    if (channel === 10) {
      info(`${this.name} setting PartC from loaded persistence data`);
      this.context.setPartC(data);
      return true;
    }

    return false;
  }

  getStatus() {
    info(`${this.name} getStatus called`);
    return '';
  }

  getName() {
    info(`${this.name} getName called`);
    return 'keks';
  }

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
      Calc.getShortSharedKey(this.context); // Calc.getShortSharedKey sets context.savedKey
      info(`${this.name} calculated shared key: ${Util.bytesToHex(this.context.savedKey)}`);
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
