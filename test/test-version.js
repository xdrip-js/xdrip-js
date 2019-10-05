const chai = require('chai');
chai.use(require('chai-datetime'));
const should = chai.should;

const VersionRequestRx0Message = require('../lib/messages/version-request-rx-0-message')
const VersionRequestRx1Message = require('../lib/messages/version-request-rx-1-message')
const VersionRequestRx2Message = require('../lib/messages/version-request-rx-2-message')

describe('Version Request Rx Message', function() {

  before(function() {
  });

  it('should parse rx 0 message data', function() {
    const data0 = Buffer.from('21000212025802120258ff00314541412412', 'hex');
    const msg = new VersionRequestRx0Message(data0);

    msg.status.should.equal(0);
    msg.firmwareVersion.should.equal('2.18.2.88');
    msg.btFirmwareVersion.should.equal('2.18.2.88');
    msg.hardwareRev.should.equal(255);
    msg.otherFirmwareVersion.should.equal('0.49.69');
    msg.asic.should.equal(9281);
  });

  it('should parse rx 1 message data', function() {
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

  it('should parse rx 2 message data', function() {
    const data2 = Buffer.from('53000a0f0000000000303235302d50726f771a', 'hex');
    msg = new VersionRequestRx2Message(data2);


    msg.status.should.equal(0);
    msg.typicalSensorDays.should.equal(10);
    msg.featureBits.should.equal(15);
  });
});
