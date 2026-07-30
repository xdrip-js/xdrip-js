// ble-packet.js
// JavaScript equivalent of the Java Packet class
// Compatible with your existing curve.js (elliptic + secp256r1) and JECPoint.js

const BN = require('bn.js');
const { JECPoint } = require('./jec-point');
const Curve = require('./curve'); // For FIELD_SIZE and PACKET_SIZE

function createByteArrayHashMap() {
  const map = new Map();

  return {
    /**
     * Get or create a fixed-size Uint8Array slot for a given ID
     * @param {number|string} id
     * @returns {Uint8Array} of length Curve.FIELD_SIZE
     */
    mget(id) {
      const key = id.toString();
      if (!map.has(key)) {
        map.set(key, new Uint8Array(Curve.FIELD_SIZE));
      }
      return map.get(key);
    },

    /**
     * Optional: retrieve stored value
     * @param {number|string} id
     * @returns {Uint8Array|null}
     */
    get(id) {
      const key = id.toString();
      return map.has(key) ? map.get(key) : null;
    },
  };
}

/**
 * Packet class - direct equivalent to the Java version
 */
class BLEPacket {
  /**
   * @param {bigint} hash - BigInt representing the hash (32 bytes when serialized)
   * @param {any} publicKeyPoint1 - elliptic EC Point (or JECPoint-wrapped)
   * @param {any} publicKeyPoint2 - elliptic EC Point (or JECPoint-wrapped)
   */
  constructor(hash, publicKeyPoint1, publicKeyPoint2) {
    this.hash = hash; // bigint
    this.publicKeyPoint1 = publicKeyPoint1 instanceof JECPoint
      ? publicKeyPoint1 : new JECPoint(publicKeyPoint1);
    this.publicKeyPoint2 = publicKeyPoint2 instanceof JECPoint
      ? publicKeyPoint2 : new JECPoint(publicKeyPoint2);
  }

  /**
   * Parse a 160-byte packet into a Packet instance
   * @param {Uint8Array|Buffer} packet - Raw 160-byte packet
   * @returns {BLEPacket|null}
   */
  static parse(packet) {
    if (packet.length < Curve.PACKET_SIZE) return null;

    const bhm = createByteArrayHashMap();
    let offset = 0;

    BLEPacket.ID_LIST.forEach((id) => {
      const slot = bhm.mget(id);
      slot.set(packet.subarray(offset, offset + Curve.FIELD_SIZE));
      offset += Curve.FIELD_SIZE;
    });

    // Extract values
    const hashBytes = bhm.get(BLEPacket.HBYTES1_ID);
    const point1X = bhm.get(BLEPacket.POINT1X_ID);
    const point1Y = bhm.get(BLEPacket.POINT1Y_ID);
    const point2X = bhm.get(BLEPacket.POINT2X_ID);
    const point2Y = bhm.get(BLEPacket.POINT2Y_ID);

    const hash = new BN(hashBytes);

    const pub1 = JECPoint.pointFromBytes(point1X, point1Y);
    const pub2 = JECPoint.pointFromBytes(point2X, point2Y);

    return new BLEPacket(hash, pub1, pub2);
  }

  /**
   * Serialize the packet to exactly 160 bytes
   * Order: point1 (X+Y), point2 (X+Y), hash (32 bytes padded)
   * @returns {Uint8Array}
   */
  output() {
    const buffer = new Uint8Array(Curve.PACKET_SIZE);
    let offset = 0;

    if (typeof this.hash.modn !== 'function') {
      throw new Error('hash must be an elliptic BN object');
    }

    // Point 1: X (32) + Y (32)
    const p1Bytes = this.publicKeyPoint1.toBytes();
    buffer.set(p1Bytes, offset);
    offset += 64;

    // Point 2: X (32) + Y (32)
    const p2Bytes = this.publicKeyPoint2.toBytes();
    buffer.set(p2Bytes, offset);
    offset += 64;

    // Hash: 32-byte big-endian padded
    const hashBytes = this.hash.toArrayLike(Buffer, 'be', 32);
    buffer.set(hashBytes, offset);

    if (buffer.length !== Curve.PACKET_SIZE) {
      throw new Error('Invalid packet size generated');
    }

    return Buffer.from(buffer);
  }
}

BLEPacket.POINT1X_ID = 28082;
BLEPacket.POINT1Y_ID = 37603;
BLEPacket.POINT2X_ID = 54247;
BLEPacket.POINT2Y_ID = 40255;
BLEPacket.HBYTES1_ID = 65535;

BLEPacket.ID_LIST = [
  BLEPacket.POINT1X_ID,
  BLEPacket.POINT1Y_ID,
  BLEPacket.POINT2X_ID,
  BLEPacket.POINT2Y_ID,
  BLEPacket.HBYTES1_ID,
];

module.exports = BLEPacket;
