// calc.js
// JavaScript port of jamorham.keks.Calc (J-PAKE implementation)

const crypto = require('crypto');
const curve = require('./curve');
const ZKP = require('./zkp');
const BLEPacket = require('./ble-packet');
const DSAChallenger = require('./dsa-challenger');

class Calc {
  static getRound12Packet(context, part2 = false) {
    const key = part2 ? context.keyB : context.keyA;
    const zkp = new ZKP(curve.G, key, context.alice);
    return new BLEPacket(zkp.getProof(), key.getPublicKey(), zkp.getGv());
  }

  static getRound1Packet(context) {
    return Calc.getRound12Packet(context, false);
  }

  static getRound2Packet(context) {
    return Calc.getRound12Packet(context, true);
  }

  static validateRound1Packet(p, party) {
    if (!p) return false;
    return ZKP.validateZeroKnowledgeProof(
      curve.G,
      p.publicKeyPoint1,
      p.publicKeyPoint2,
      p.hash,
      party,
    );
  }

  static validateRound1PacketContext(context) {
    return Calc.validateRound1Packet(context.getRound1Packet(), context.bob);
  }

  static validateRound2PacketContext(context) {
    return Calc.validateRound1Packet(context.getRound2Packet(), context.bob);
  }

  static getRound3Packet(context) {
    const packet1 = context.getRound1Packet();
    const packet2 = context.getRound2Packet();

    const x1 = context.keyA.getPublicKey();
    const x2 = context.keyB.getPrivateKey();
    const x3 = packet1.getPublicKeyPoint1().getPoint();
    const x4 = packet2.getPublicKeyPoint1().getPoint();

    const s = context.getPasswordBigInteger();

    const x2s = x2.mul(s).umod(curve.Q);
    const x134 = x1.add(x3).add(x4);
    const A = x134.mul(x2s);

    const zkp = new ZKP(x134, { privateKey: x2s, publicKey: A }, context.alice);

    return new BLEPacket(zkp.getProof(), A, zkp.getGv());
  }

  static validateRound3Packet(context) {
    const packet = context.getRound3Packet();
    if (!packet) return false;

    const x1 = context.keyA.getPublicKey();
    const x2 = context.keyB.getPublicKey();
    const x3 = context.getRound1Packet().getPublicKeyPoint1().getPoint();

    const g = x1.add(x2).add(x3);
    const public1 = packet.getPublicKeyPoint1().getPoint();

    return ZKP.validateZeroKnowledgeProof(
      g,
      public1,
      packet.getPublicKeyPoint2().getPoint(),
      packet.getHash(),
      context.bob,
    );
  }

  static getSharedKey(context) {
    if (!context.getRound3Packet()) return null;

    const point1 = context.getRound3Packet().getPublicKeyPoint1().getPoint();
    const x2 = context.keyB.getPrivateKey();
    const x4 = context.getRound2Packet().getPublicKeyPoint1().getPoint();
    const s = context.getPasswordBigInteger();

    const x2s = x2.mul(s).umod(curve.Q);

    const gx4X2s = x4.mul(x2s);

    const temp = point1.add(gx4X2s.neg());
    const keyPoint = temp.mul(x2);

    const xBytes = keyPoint.getX().toArrayLike(Buffer, 'be', 32);
    return crypto.createHash('sha256').update(xBytes).digest();
  }

  static getShortSharedKey(context) {
    const full = Calc.getSharedKey(context);
    return full ? full.slice(0, 16) : null;
  }

  static calculateHash(context) {
    const data = context.challenge;
    const key = context.savedKey || Calc.getShortSharedKey(context);

    if (!key) return null;

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
    // const privateKey = curve.Q.fromRed().fromArray(Array.from(bytes));

    return new DSAChallenger({ privateKey: keyPair.privateKey }).response(challenge);
  }
}

module.exports = Calc;
