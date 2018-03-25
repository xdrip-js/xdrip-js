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
    messages.forEach(message => {
      parser.parse(message);
    });

    // for (let message in messages) {
    //   console.log(message.toString('hex'));
    //   parser.parse(message);
    // }

    // there are 37 distinct glucose messages
    //spy.should.have.been.called.exactly(37);
  });
});

// Individual glucose messages:

// f93e0000
// 9e326600 5700 0602
// ca336600 5c00 0606
// f6346600 5f00 0608
// 22366600 6600 060a
// 4e376600 6400 0606
// 7a386600 6300 0603
// a6396600 6300 0600
// d23a6600 6100 06fe
// fe3b6600 6100 06fe
// 2a3d6600 6100 06ff
// 563e6600 6100 0600
// 823f6600 5d00 06fe
// ae406600 5700 06fa
// da416600 5500 07f9
// 06436600 5800 07fc
// 32446600 5b00 0702
// 5e456600 6300 0708
// 8a466600 6b00 070d
// b6476600 7200 070f
// e2486600 7400 070c
// 0e4a6600 8800 0607
// 3a4b6600 9000 0608
// 664c6600 8e00 0604
// 924d6600 8900 0600
// be4e6600 7f00 06f8
// ea4f6600 7900 06f3
// 16516600 7000 06f1
// 42526600 6f00 06f5
// 6e536600 6d00 06f9
// 9a546600 6600 06f9
// c6556600 6500 06fa
// f2566600 6800 06fd
// 1e586600 7000 0604
// 4a596600 7000 0606
// 765a6600 6e00 0603
// a25b6600 6800 06fd
// ce5c6600 6900 06fc

// To reconstruct a glucose message we need the following:

// status:    timeMessage
// sequence:  first element perhaps?
// timestamp: backfill
// glucose:   backfill
// state:     backfill
// trend:     backfill
