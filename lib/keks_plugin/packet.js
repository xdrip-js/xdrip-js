// Packet.js
// JavaScript equivalent of the Java Packet class
// Compatible with your existing curve.js (elliptic + secp256r1) and JECPoint.js

const { JECPoint } = require('./jec-point'); // Adjust path if needed
const curve = require('./curve'); // For FIELD_SIZE and PACKET_SIZE

function createByteArrayHashMap() {
  const map = new Map();

  return {
    /**
     * Get or create a fixed-size Uint8Array slot for a given ID
     * @param {number|string} id
     * @returns {Uint8Array} of length curve.FIELD_SIZE
     */
    mget(id) {
      const key = id.toString();
      if (!map.has(key)) {
        map.set(key, new Uint8Array(curve.FIELD_SIZE));
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
class Packet {
  /**
   * @param {bigint} hash - BigInt representing the hash (32 bytes when serialized)
   * @param {any} publicKeyPoint1 - elliptic EC Point (or JECPoint-wrapped)
   * @param {any} publicKeyPoint2 - elliptic EC Point (or JECPoint-wrapped)
   */
  constructor(hash, publicKeyPoint1, publicKeyPoint2) {
    this.hash = hash; // bigint
    this.publicKeyPoint1 = publicKeyPoint1 instanceof JECPoint
      ? publicKeyPoint1.getPoint() : publicKeyPoint1;
    this.publicKeyPoint2 = publicKeyPoint2 instanceof JECPoint
      ? publicKeyPoint2.getPoint() : publicKeyPoint2;
  }

  getHash() {
    return this.hash;
  }

  getPublicKeyPoint1() {
    return this.publicKeyPoint1;
  }

  getPublicKeyPoint2() {
    return this.publicKeyPoint2;
  }

  /**
   * Parse a 160-byte packet into a Packet instance
   * @param {Uint8Array|Buffer} packet - Raw 160-byte packet
   * @returns {Packet|null}
   */
  static parse(packet) {
    if (packet.length < curve.PACKET_SIZE) return null;

    const bhm = createByteArrayHashMap();
    let offset = 0;

    Packet.ID_LIST.forEach((id) => {
      const slot = bhm.mget(id);
      slot.set(packet.subarray(offset, offset + curve.FIELD_SIZE));
      offset += curve.FIELD_SIZE;
    });

    // Extract values
    const hashBytes = bhm.get(Packet.HBYTES1_ID);
    const point1X = bhm.get(Packet.POINT1X_ID);
    const point1Y = bhm.get(Packet.POINT1Y_ID);
    const point2X = bhm.get(Packet.POINT2X_ID);
    const point2Y = bhm.get(Packet.POINT2Y_ID);

    // Convert hash bytes to bigint (big-endian)
    let hash = 0n;
    hashBytes.forEach((byte) => {
      hash = (hash * 256n) + BigInt(byte);
    });

    const pub1 = JECPoint.pointFromBytes(point1X, point1Y).getPoint();
    const pub2 = JECPoint.pointFromBytes(point2X, point2Y).getPoint();

    return new Packet(hash, pub1, pub2);
  }

  /**
   * Serialize the packet to exactly 160 bytes
   * Order: point1 (X+Y), point2 (X+Y), hash (32 bytes padded)
   * @returns {Uint8Array}
   */
  output() {
    const buffer = new Uint8Array(curve.PACKET_SIZE);
    let offset = 0;

    // Point 1: X (32) + Y (32)
    const p1Bytes = new JECPoint(this.publicKeyPoint1).toBytes();
    buffer.set(p1Bytes, offset);
    offset += 64;

    // Point 2: X (32) + Y (32)
    const p2Bytes = new JECPoint(this.publicKeyPoint2).toBytes();
    buffer.set(p2Bytes, offset);
    offset += 64;

    // Hash: 32-byte big-endian padded
    const hashBytes = new Uint8Array(32);
    let temp = this.hash;
    for (let i = 31; i >= 0;) {
      hashBytes[i] = Number(temp % 256n);
      temp /= 256n;
      i -= 1;
    }
    buffer.set(hashBytes, offset);

    if (buffer.length !== curve.PACKET_SIZE) {
      throw new Error('Invalid packet size generated');
    }

    return buffer;
  }
}

Packet.POINT1X_ID = 28082;
Packet.POINT1Y_ID = 37603;
Packet.POINT2X_ID = 54247;
Packet.POINT2Y_ID = 40255;
Packet.HBYTES1_ID = 65535;

Packet.ID_LIST = [
  Packet.POINT1X_ID,
  Packet.POINT1Y_ID,
  Packet.POINT2X_ID,
  Packet.POINT2Y_ID,
  Packet.HBYTES1_ID,
];

module.exports = { Packet };
