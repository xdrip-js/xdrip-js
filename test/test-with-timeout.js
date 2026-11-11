const chai = require('chai');

chai.should();
const { expect } = chai;

const withTimeout = require('../lib/with-timeout');
const SerialOperationQueue = require('../lib/serial-operation-queue');

const never = () => new Promise(() => {});
const noCleanup = () => {};

describe('withTimeout', () => {
  it('resolves with the work result when it finishes in time', async () => {
    const value = await withTimeout(async () => 42, 50, 'too slow', noCleanup);
    value.should.equal(42);
  });

  it('rejects (instead of throwing uncaught) when the work hangs', async () => {
    let error;
    try {
      await withTimeout(never, 20, 'Timeout waiting for discover services', noCleanup);
    } catch (err) {
      error = err;
    }
    expect(error).to.be.an('error');
    error.message.should.equal('Timeout waiting for discover services');
  });

  it('passes through errors from the work', async () => {
    let error;
    try {
      await withTimeout(async () => { throw new Error('No device'); }, 50, 'too slow', noCleanup);
    } catch (err) {
      error = err;
    }
    error.message.should.equal('No device');
  });

  it('registers a cleanup that cancels the timer', async () => {
    const cleanups = [];
    await withTimeout(async () => 1, 10000, 'too slow', (fn) => cleanups.push(fn));
    cleanups.length.should.equal(1);
    cleanups[0](); // must not throw; the timer is cleared
  });

  it('lets a SerialOperationQueue move on after a timed-out operation', async () => {
    const queue = new SerialOperationQueue('test', 0);
    const hung = queue.enqueue({
      operationName: 'hung',
      executor: ({ addCleanup }) => withTimeout(never, 20, 'hung op timed out', addCleanup),
    });
    const next = queue.enqueue({ operationName: 'next', executor: async () => 'ran' });

    let error;
    try { await hung; } catch (err) { error = err; }
    error.message.should.equal('hung op timed out');
    (await next).should.equal('ran');
  });
});
