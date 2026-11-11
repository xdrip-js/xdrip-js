const chai = require('chai');
chai.use(require('chai-datetime'));

chai.should();

const VersionRequestRx0Message = require('../lib/messages/version-request-rx-0-message');
const VersionRequestRx1Message = require('../lib/messages/version-request-rx-1-message');
const VersionRequestRx2Message = require('../lib/messages/version-request-rx-2-message');

describe('Version Request Rx Message', () => {
  before(() => {
  });

  it('should parse rx 0 message data', () => {
    const data0 = Buffer.from('21000212025802120258ff00314541412412', 'hex');
    const msg = new VersionRequestRx0Message(data0);

    msg.status.should.equal(0);
    msg.firmwareVersion.should.equal('2.18.2.88');
    msg.btFirmwareVersion.should.equal('2.18.2.88');
    msg.hardwareRev.should.equal(255);
    msg.otherFirmwareVersion.should.equal('0.49.69');
    msg.asic.should.equal(9281);
  });

  it('should parse rx 1 message data', () => {
    const data1 = Buffer.from('4b00021202582a2e00001100036e006d010997', 'hex');
    msg = new VersionRequestRx1Message(data1);

    msg.status.should.equal(0);
    msg.firmwareVersion.should.equal('2.18.2.88');
    msg.buildVersion.should.equal(11818);
    msg.inactiveDays.should.equal(17);
    msg.versionCode.should.equal(3);
    msg.maxRuntimeDays.should.equal(110);
    msg.maxInactiveDays.should.equal(27904);
  });

  it('should parse rx 2 message data', () => {
    const data2 = Buffer.from('53000a0f0000000000303235302d50726f771a', 'hex');
    msg = new VersionRequestRx2Message(data2);

    msg.status.should.equal(0);
    msg.typicalSensorDays.should.equal(10);
    msg.featureBits.should.equal(15);
  });

  // Real G7 0x52 replies, as captured in LoopKit g7sim g7/state.go
  it('should parse a G7 10-day 0x52 reply', () => {
    msg = new VersionRequestRx2Message(Buffer.from('5200c0d70d00540600020404ff0c00', 'hex'));

    msg.sessionLengthSeconds.should.equal(907200); // 10 days + 12 h grace
    msg.warmupSeconds.should.equal(1620); // 27 min
    msg.algorithmVersion.should.equal(0x04040200);
    msg.maxLifetimeDays.should.equal(12);
    msg.typicalSensorDays.should.equal(10);
  });

  it('should parse a G7 15-day 0x52 reply', () => {
    msg = new VersionRequestRx2Message(Buffer.from('5200406f1400880e00010a04ff1100', 'hex'));

    msg.sessionLengthSeconds.should.equal(1339200); // 15 days + 12 h grace
    msg.warmupSeconds.should.equal(3720); // 62 min
    msg.algorithmVersion.should.equal(0x040a0100);
    msg.maxLifetimeDays.should.equal(17);
    msg.typicalSensorDays.should.equal(15);
  });

  it('should reject a truncated G7 0x52 reply', () => {
    (() => new VersionRequestRx2Message(Buffer.from('5200406f1400880e00010a', 'hex')))
      .should.throw(/invalid length/);
  });
});
