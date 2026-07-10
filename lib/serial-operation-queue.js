// serialOperationQueue.js

const debug = require('debug')('serial-operation-queue');

class SerialOperationQueue {
  constructor(defaultDelayMs = 50) {
    this.defaultDelayMs = Math.max(0, defaultDelayMs);
    this.operationQueue = [];
    this.outstandingPromise = null;
  }

  cleanup(cleanupFn, task) {
    this.outstandingPromise = null;

    try {
      cleanupFn?.();
    } catch (err) {
      debug(`Cleanup error for "${task.operationName}": ${err.message}`);
    }

    debug(`Cleanup completed for "${task.operationName}"`);
  }

  processNextTask(delayMs = this.defaultDelayMs) {
    if (this.operationQueue.length === 0) {
      debug('Queue empty');
      return;
    }

    const nextTask = this.operationQueue.shift();

    if (delayMs > 0) {
      setTimeout(() => this.executeTask(nextTask), delayMs);
    } else {
      this.executeTask(nextTask);
    }
  }

  executeTask(task) {
    debug(`Starting "${task.operationName}"`);

    let cleanupFn = null;

    this.outstandingPromise = new Promise((resolve, reject) => {
      try {
        const startCleanup = task.onStart?.(resolve, reject);
        const executorCleanup = task.executor(resolve, reject);

        cleanupFn = () => {
          try {
            executorCleanup?.();
          } finally {
            try {
              startCleanup?.();
            } finally {
              task.onCleanup?.();
            }
          }
        };
      } catch (err) {
        reject(err);
      }
    });

    this.outstandingPromise
      .then((value) => {
        this.cleanup(cleanupFn, task);
        task.resolve(value);
        this.processNextTask(task.delayMs);
      })
      .catch((err) => {
        this.cleanup(cleanupFn, task);
        task.reject(err);
        this.processNextTask(task.delayMs);
      });
  }

  enqueue({
    executor,
    operationName = 'unknown operation',
    delayMs = this.defaultDelayMs,
    onStart,
    onCleanup,
  }) {
    return new Promise((resolve, reject) => {
      const task = {
        executor,
        operationName,
        delayMs: Math.max(0, delayMs),
        onStart,
        onCleanup,
        resolve,
        reject,
      };

      if (this.outstandingPromise) {
        this.operationQueue.push(task);
      } else {
        this.executeTask(task);
      }
    });
  }

  clearQueue() {
    this.operationQueue.length = 0;
  }

  getQueueLength() {
    return this.operationQueue.length;
  }

  setDefaultDelay(ms) {
    this.defaultDelayMs = Math.max(0, ms);
  }

  get isBusy() {
    return this.outstandingPromise !== null;
  }
}

module.exports = SerialOperationQueue;
