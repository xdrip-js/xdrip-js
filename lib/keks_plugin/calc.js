// calc.js
// JavaScript port of jamorham.keks.Calc (J-PAKE implementation)

const debug = require('debug')('keks-calc');
const crypto = require('crypto');
const Curve = require('./curve');
const ZKP = require('./zkp');
const BLEPacket = require('./ble-packet');
const DSAChallenger = require('./dsa-challenger');
const Util = require('./util');

class Calc {
  static getRound12Packet(context, part2 = false) {
    const key = part2 ? context.keyB : context.keyA;

    // in this case we are sending it to the other side
    // so we need to use the other side's context
    const party = context.role === 'bob' ? context.alice : context.bob;

    // Cache ZKP per key to avoid regenerating random
    if (!key.zkpCache || key.zkpCache.party !== party) {
      key.zkpCache = new ZKP(Curve.G, key, party);
    }

    const zkp = key.zkpCache;

    return new BLEPacket(zkp.getProof(), key.publicKey, zkp.getGv());
  }

  static getRound1Packet(context) {
    return Calc.getRound12Packet(context, false);
  }

  static getRound2Packet(context) {
    return Calc.getRound12Packet(context, true);
  }

  static validateRound1Packet(p, party) {
    if (!p) return false;
    debug(`validateRound1Packet: ${p} ${party}`);
    return ZKP.validateZeroKnowledgeProof(
      Curve.G,
      p.publicKeyPoint1,
      p.publicKeyPoint2,
      p.hash,
      party,
    );
  }

  static validateRound1PacketContext(context) {
    const party = context.role === 'bob' ? context.bob : context.alice;

    return Calc.validateRound1Packet(context.getRound1Packet(), party);
  }

  static validateRound2PacketContext(context) {
    const party = context.role === 'bob' ? context.bob : context.alice;

    return Calc.validateRound1Packet(context.getRound2Packet(), party);
  }

  static getRound3Packet(context) {
    const packet1 = context.getRound1Packet();
    const packet2 = context.getRound2Packet();

    if (!packet1 || !packet2) {
      debug(`getRound3Packet but ${!packet1 ? 'do not have' : 'have'} packet1 and ${!packet2 ? 'do not have' : 'have'} packet2`);
      return null;
    }

    const x1 = context.keyA.publicKey;
    const x2 = context.keyB.privateKey;
    const x3 = packet1.publicKeyPoint1.point;
    const x4 = packet2.publicKeyPoint1.point;

    const s = context.getPasswordBigInteger();

    const x2s = x2.mul(s).umod(Curve.Q);
    const x134 = x1.add(x3).add(x4);
    const A = x134.mul(x2s);

    const party = context.role === 'bob' ? context.bob : context.alice;

    const zkp = new ZKP(x134, { privateKey: x2s, publicKey: A }, party);

    return new BLEPacket(zkp.getProof(), A, zkp.getGv());
  }

  static validateRound3Packet(context) {
    const round1Packet = context.getRound1Packet();
    const round3Packet = context.getRound3Packet();
    if (!round1Packet || !round3Packet) return false;

    const x1 = context.keyA.publicKey;
    const x2 = context.keyB.publicKey;
    const x3 = round1Packet.publicKeyPoint1.point;

    const g = x1.add(x2).add(x3);
    const public1 = round3Packet.publicKeyPoint1;

    const party = context.role === 'bob' ? context.bob : context.alice;

    return ZKP.validateZeroKnowledgeProof(
      g,
      public1,
      round3Packet.publicKeyPoint2,
      round3Packet.hash,
      party,
    );
  }

  static getSharedKey(context) {
    debug('getSharedKey: starting calculation');

    if (!context.getRound3Packet()) {
      debug('getSharedKey: round3Packet is null - returning null');
      return null;
    }

    const point1 = context.getRound3Packet().publicKeyPoint1.point;
    debug(`getSharedKey: point1 = ${point1.getX().toString(16)},${point1.getY().toString(16)}`);

    const x2 = context.keyB.privateKey;
    debug(`getSharedKey: x2 (privateKey B) = ${x2.toString(16)}`);

    const x4 = context.getRound2Packet().publicKeyPoint1.point;
    debug(`getSharedKey: x4 = ${x4.getX().toString(16)},${x4.getY().toString(16)}`);

    const s = context.getPasswordBigInteger();
    debug(`getSharedKey: s (password) = ${s.toString(16)}`);

    // x2 * s mod Q
    const x2s = x2.mul(s).umod(Curve.Q);
    debug(`getSharedKey: x2s = x2 * s mod Q = ${x2s.toString(16)}`);

    // gx4 * x2s
    const gx4X2s = x4.mul(x2s);
    debug(`getSharedKey: gx4X2s = x4 * x2s = ${gx4X2s.getX().toString(16)},${gx4X2s.getY().toString(16)}`);

    // point1 - gx4X2s
    const temp = point1.add(gx4X2s.neg());
    debug(`getSharedKey: temp = point1 - gx4X2s = ${temp.getX().toString(16)},${temp.getY().toString(16)}`);

    // temp * x2
    const keyPoint = temp.mul(x2);
    debug(`getSharedKey: keyPoint = temp * x2 = ${keyPoint.getX().toString(16)},${keyPoint.getY().toString(16)}`);

    // Extract X coordinate as 32-byte big-endian buffer
    const xBytes = keyPoint.getX().toArrayLike(Buffer, 'be', 32);
    debug(`getSharedKey: xBytes = ${Util.bytesToHex(xBytes)}`);

    // Final SHA-256 hash
    const sharedKey = crypto.createHash('sha256').update(xBytes).digest();
    debug(`getSharedKey: calculated shared key = ${Util.bytesToHex(sharedKey)}`);

    return sharedKey;
  }

  static getShortSharedKey(context) {
    const full = Calc.getSharedKey(context);
    return full ? full.slice(0, 16) : null;
  }

  static calculateHash(context) {
    const data = context.challenge;
    const key = context.savedKey || Calc.getShortSharedKey(context);

    if (!key) {
      debug('failed to calculateHash - no key');
      return null;
    }

    debug(`calculating hash with challenge ${Util.bytesToHex(data)}`);

    const doubleData = Buffer.concat([data, data]);

    const cipher = crypto.createCipheriv('aes-128-ecb', key, null);
    cipher.setAutoPadding(false);
    const aesBytes = Buffer.concat([cipher.update(doubleData), cipher.final()]);

    return aesBytes.slice(0, 8);
  }

  static challenger(bytes, challenge) {
    const keyPair = {
      privateKey: bytes, // assume bytes is the private key scalar as BN
    };
    // If bytes is Buffer, convert:
    // const privateKey = Curve.Q.fromRed().fromArray(Array.from(bytes));

    return new DSAChallenger({ privateKey: keyPair.privateKey }).response(challenge);
  }
}

module.exports = Calc;
