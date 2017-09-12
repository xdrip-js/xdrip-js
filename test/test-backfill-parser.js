const chai = require('chai');
const spies = require('chai-spies');

chai.use(spies);

const should = chai.should;

const BackfillParser = require('../lib/backfill-parser');

describe('BackfillParser', function() {

  it('should parse backfill messages', function() {
    const messages = [
      Buffer.from('0180f93e00009e32660057000602ca3366005c00', 'hex'),
      Buffer.from('02800606f63466005f000608223666006600060a', 'hex'),
      Buffer.from('03804e376600640006067a38660063000603a639', 'hex'),
      Buffer.from('0480660063000600d23a6600610006fefe3b6600', 'hex'),
      Buffer.from('0580610006fe2a3d6600610006ff563e66006100', 'hex'),
      Buffer.from('06800600823f66005d0006feae406600570006fa', 'hex'),
      Buffer.from('0780da416600550007f906436600580007fc3244', 'hex'),
      Buffer.from('088066005b0007025e456600630007088a466600', 'hex'),
      Buffer.from('09806b00070db64766007200070fe24866007400', 'hex'),
      Buffer.from('0a80070c0e4a6600880006073a4b660090000608', 'hex'),
      Buffer.from('0b80664c66008e000604924d660089000600be4e', 'hex'),
      Buffer.from('0c8066007f0006f8ea4f6600790006f316516600', 'hex'),
      Buffer.from('0d80700006f1425266006f0006f56e5366006d00', 'hex'),
      Buffer.from('0e8006f99a546600660006f9c6556600650006fa', 'hex'),
      Buffer.from('0f80f2566600680006fd1e586600700006044a59', 'hex'),
      Buffer.from('1080660070000606765a66006e000603a25b6600', 'hex'),
      Buffer.from('1180680006fdce5c6600690006fc', 'hex')
    ];

    function callback () {

    }

    const spy = chai.spy(callback);

    const parser = new BackfillParser(spy);
    for (let message in messages) {
      parser.parse(message);
    }

    // there are 37 distinct glucose messages
    spy.should.have.been.called.exactly(37);
  });
});
