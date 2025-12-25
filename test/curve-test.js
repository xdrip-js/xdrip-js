// curve.test.js
const assert = require('node:assert/strict');
const curve = require('../lib/keks_plugin/curve');

describe('Curve module (secp256r1 equivalent)', function () {

  it('curve name should be secp256r1', function () {
    // console.log('Curve name:', curve.name);
    assert.strictEqual(curve.name, 'secp256r1');
  });

  it('curve bits, field size and packet size should be correct', function () {
    // console.log('Curve bits:', curve.CURVE_BITS);
    // console.log('Field size (bytes):', curve.FIELD_SIZE);
    // console.log('Packet size:', curve.PACKET_SIZE);

    assert.strictEqual(curve.CURVE_BITS, 256);
    assert.strictEqual(curve.FIELD_SIZE, 32);
    assert.strictEqual(curve.PACKET_SIZE, 160);
  });

  it('generator point G coordinates should match known secp256r1 values', function () {
    const g = curve.G;
    const x = g.getX().toString(16).toUpperCase();
    const y = g.getY().toString(16).toUpperCase();

    // console.log('Generator G X:', x);
    // console.log('Generator G Y:', y);

    assert.strictEqual(x, '6B17D1F2E12C4247F8BCE6E563A440F277037D812DEB33A0F4A13945D898C296');
    assert.strictEqual(y, '4FE342E2FE1A7F9B8EE7EB4A7C0F9E162BCE33576B315ECECBB6406837BF51F5');
  });

  it('curve order Q should be correct for P-256', function () {
    const expectedQ = 'FFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551';
    const qHex = curve.Q.toString(16).toUpperCase();

    // console.log('Curve order Q (hex):', qHex);
    // console.log('Q - 1 (hex):        ', curve.QM1.toString(16).toUpperCase());

    assert.strictEqual(qHex, expectedQ);
    assert(curve.QM1.eq(curve.Q.subn(1)));
  });

  it('getExponent() should return values in range [1, Q-1]', function () {
    for (let i = 0; i < 1000; i++) {
      const exp = curve.getExponent();

      assert(exp.cmpn(1) >= 0);
      assert(exp.cmp(curve.QM1) <= 0);
      assert(exp.cmpn(0) !== 0);
      assert(exp.cmp(curve.Q) !== 0);
    }

    const sample = curve.getExponent();
    // console.log('Sample random exponent (hex):', sample.toString(16).toUpperCase());
  });

  it('generated exponent can be used to compute valid point on curve', function () {
    const k = curve.getExponent();
    const publicPoint = curve.G.mul(k);

    const px = publicPoint.getX().toString(16).toUpperCase();
    const py = publicPoint.getY().toString(16).toUpperCase();

    // console.log('Example public point from random exponent:');
    // console.log('  X:', px);
    // console.log('  Y:', py);

    assert(publicPoint !== null);
    assert(!publicPoint.isInfinity());
    assert(curve.curve.validate(publicPoint));
  });

  it('multiple calls to getExponent produce different values', function () {
    const first = curve.getExponent();
    const second = curve.getExponent();

    // console.log('Two consecutive exponents (should be different):');
    // console.log('  First: ', first.toString(16).toUpperCase());
    // console.log('  Second:', second.toString(16).toUpperCase());

    assert(!first.eq(second));
  });
});
