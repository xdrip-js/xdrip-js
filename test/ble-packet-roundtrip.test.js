// test/ble-packet-roundtrip.test.js
// Test that BLEPacket correctly parses its own output (round-trip serialization)

const debug = require('debug');
const { expect } = require('chai');
const { ec: EC } = require('elliptic');
const ec = new EC('p256');
const BN = require('bn.js');
const BLEPacket = require('../lib/keks_plugin/ble-packet');
const JECPoint = require('../lib/keks_plugin/jec-point').JECPoint;
const curve = require('../lib/keks_plugin/curve');
const Util = require('../lib/keks_plugin/util');

describe('BLEPacket round-trip serialization', function () {
  // debug.enable('keks-plugin:*');

  it('should correctly parse its own output', function () {
    // Generate random proof (BN), public keys (Points)
    const proof = ec.genKeyPair().getPrivate(); // random BN as proof
    const pub1 = ec.genKeyPair().getPublic(); // random point
    const pub2 = ec.genKeyPair().getPublic(); // random point

    // Wrap in JECPoint
    const jecPub1 = new JECPoint(pub1);
    const jecPub2 = new JECPoint(pub2);

    // Create packet
    const originalPacket = new BLEPacket(proof, jecPub1, jecPub2);

    // Serialize
    const serialized = originalPacket.output();

    // Check length
    expect(serialized).to.have.length(curve.PACKET_SIZE); // 160

    // Parse back
    const parsedPacket = BLEPacket.parse(serialized);

    // Check parsed is not null
    expect(parsedPacket).to.not.be.null;

    // Compare proof (BN)
    expect(parsedPacket.hash.eq(originalPacket.hash)).to.be.true;

    // Compare points (X and Y coordinates)
    expect(parsedPacket.publicKeyPoint1.point.getX().eq(originalPacket.publicKeyPoint1.point.getX())).to.be.true;
    expect(parsedPacket.publicKeyPoint1.point.getY().eq(originalPacket.publicKeyPoint1.point.getY())).to.be.true;

    expect(parsedPacket.publicKeyPoint2.point.getX().eq(originalPacket.publicKeyPoint2.point.getX())).to.be.true;
    expect(parsedPacket.publicKeyPoint2.point.getY().eq(originalPacket.publicKeyPoint2.point.getY())).to.be.true;
  });

  it('should handle multiple random packets', function () {
    for (let i = 0; i < 10; i++) {
      const proof = ec.genKeyPair().getPrivate();
      const pub1 = ec.genKeyPair().getPublic();
      const pub2 = ec.genKeyPair().getPublic();

      const original = new BLEPacket(proof, new JECPoint(pub1), new JECPoint(pub2));
      const serialized = original.output();
      const parsed = BLEPacket.parse(serialized);

      expect(parsed.hash.eq(original.hash)).to.be.true;
      expect(parsed.publicKeyPoint1.point.eq(original.publicKeyPoint1.point)).to.be.true;
      expect(parsed.publicKeyPoint2.point.eq(original.publicKeyPoint2.point)).to.be.true;
    }
  });
});
