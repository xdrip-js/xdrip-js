const { expect } = require('chai');

const Plugin = require('../lib/keks_plugin/plugin');

// The sensor's certificate bytes (ExtraData notifications) can be processed
// before its 0B ack (Authentication), which is what tells the plugin how many
// bytes to expect. Both orders must complete the certificate step.
// (Reproduction from interop/repro/cert-data-before-ack.js.)
function runCertStep(order) {
  const p = new Plugin('1234', 'bob');
  p.state = Plugin.SendCertificate0;
  p.aNext(); // sends 0b 00 <len partA>; state SendCertificate1
  const cert = Buffer.alloc(346, 0xab);
  const ack = Buffer.from('0b00005a010000', 'hex'); // announces 0x015a = 346 bytes
  let completed = false;

  const feedData = () => {
    for (let i = 0; i < cert.length; i += 20) {
      if (p.receivedData(cert.subarray(i, i + 20))) completed = true;
    }
  };
  const ackThenSend = () => {
    if (p.receivedResponse(ack)) {
      p.aNext(); // sends our partA; state SendCertificate1out
      if (p.checkAccumulated()) completed = true; // data that arrived early
    }
  };

  if (order === 'ack-first') {
    ackThenSend();
    feedData();
  } else {
    feedData();
    ackThenSend();
  }
  return { completed, state: Plugin.stateToName(p.state) };
}

describe('KEKS Plugin certificate step ordering', () => {
  it('completes when the ack arrives before the certificate data', () => {
    expect(runCertStep('ack-first').completed).to.equal(true);
  });

  it('completes when the certificate data arrives before the ack', () => {
    const dataFirst = runCertStep('data-first');
    expect(dataFirst.completed).to.equal(true);
    expect(dataFirst.state).to.equal(runCertStep('ack-first').state);
  });

  it('reports nothing pending when no data is buffered', () => {
    const p = new Plugin('1234', 'bob');
    p.state = Plugin.Round1;
    expect(p.checkAccumulated()).to.equal(false);
  });
});
