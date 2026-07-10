const assert = require('assert');
const debug = require('debug')('serial-operation-queue');

class SerialOperationQueue {
  constructor(defaultDelayMs = 50) {
    this.defaultDelayMs = defaultDelayMs;

    this.operationQueue = [];
    this.outstandingPromise = null;

    this.nextAllowedStartTime = 0;
    this.nextTaskTimer = null;
  }

  enqueue({
    executor,
    operationName = 'unknown operation',
    delayMs = this.defaultDelayMs,
    onStart,
  }) {
    return new Promise((resolve, reject) => {
      this.operationQueue.push({
        executor,
        operationName,
        delayMs: Math.max(0, delayMs),
        onStart,
        resolve,
        reject,
      });

      debug(
        `Queued "${operationName}" (${this.operationQueue.length} pending)`,
      );

      this.maybeStartNext();
    });
  }

  /**
   * Starts the next queued operation if and only if:
   *   - no operation is currently running,
   *   - no delayed start is already scheduled, and
   *   - the required inter-operation delay has elapsed.
   *
   * This is the only method that decides when operations begin.
   */
  maybeStartNext() {
    if (this.outstandingPromise) {
      return;
    }

    if (this.nextTaskTimer) {
      return;
    }

    if (this.operationQueue.length === 0) {
      debug('Queue empty');
      return;
    }

    const nextTask = this.operationQueue[0];

    const wait = Math.max(0, this.nextAllowedStartTime - Date.now());

    if (wait === 0) {
      this.executeNextTask();
      return;
    }

    debug(
      `Waiting ${wait}ms before starting "${nextTask.operationName}"`,
    );

    this.nextTaskTimer = setTimeout(() => {
      this.executeNextTask();
    }, wait);
  }

  executeNextTask() {
    assert(
      !this.outstandingPromise,
      'executeNextTask() called while another task is running',
    );

    this.nextTaskTimer = null;

    const task = this.operationQueue.shift();

    debug(`Starting "${task.operationName}"`);

    const cleanupHandlers = [];

    const addCleanup = (handler) => {
      if (typeof handler === 'function') {
        cleanupHandlers.push(handler);
      }
    };

    const runCleanup = async () => {
      while (cleanupHandlers.length > 0) {
        const cleanup = cleanupHandlers.pop();

        try {
          // eslint-disable-next-line no-await-in-loop
          await cleanup();
        } catch (err) {
          debug(
            `Cleanup error for "${task.operationName}": ${err.message}`,
          );
        }
      }
    };

    const context = {
      addCleanup,
      reject: task.reject,
    };

    this.outstandingPromise = Promise.resolve()
      .then(() => task.onStart?.(context))
      .then(() => task.executor({ addCleanup }))
      .finally(async () => {
        await runCleanup();

        this.nextAllowedStartTime = Date.now() + task.delayMs;
        this.outstandingPromise = null;

        this.maybeStartNext();
      });

    this.outstandingPromise
      .then((value) => {
        debug(`Completed "${task.operationName}"`);

        task.resolve(value);
      })
      .catch((err) => {
        debug(
          `Failed "${task.operationName}": ${err.message || err}`,
        );

        task.reject(err);
      });
  }

  getQueueLength() {
    return this.operationQueue.length;
  }

  clearQueue() {
    this.operationQueue.length = 0;
  }

  setDefaultDelay(ms) {
    this.defaultDelayMs = Math.max(0, ms);
  }
}

module.exports = SerialOperationQueue;
