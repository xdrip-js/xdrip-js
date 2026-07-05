// jealousPromise.js

const debug = require('debug')('bluetooth-manager');

let outstandingPromise = null;
const operationQueue = [];

/**
 * Default delay (in ms) between completion of one operation and start of the next.
 * You can override this when calling jealousPromise.
 */
let DEFAULT_DELAY_MS = 50; // Adjust as needed for your Bluetooth device

function cleanup(task, peripheral) {
  outstandingPromise = null;
  if (task?.disconnectHandler) {
    peripheral.removeListener('disconnect', task.disconnectHandler);
    // eslint-disable-next-line no-param-reassign
    task.disconnectHandler = null;
  }
  debug(`Cleanup completed for: ${task?.operationName || 'unknown'}`);
}

let executeTask;

function processNextTask(peripheral, delayMs = DEFAULT_DELAY_MS) {
  if (operationQueue.length === 0) {
    debug('Queue empty - no more operations pending');
    return;
  }

  const nextTask = operationQueue.shift();
  debug(`Dequeued next operation: "${nextTask.operationName}" (${operationQueue.length} remaining in queue)`);

  if (delayMs > 0) {
    debug(`Applying ${delayMs}ms delay before starting next operation`);
    setTimeout(() => {
      executeTask(nextTask, peripheral);
    }, delayMs);
  } else {
    executeTask(nextTask, peripheral);
  }
}

executeTask = (task, peripheral) => {
  const { executor, operationName } = task;

  debug(`Starting operation: "${operationName}"`);

  outstandingPromise = new Promise((innerResolve, innerReject) => {
    // eslint-disable-next-line no-param-reassign
    task.disconnectHandler = () => {
      const errMsg = `Transmitter disconnected during: ${operationName}`;
      debug(`DISCONNECT detected during ${operationName}`);
      innerReject(new Error(errMsg));
    };

    peripheral.once('disconnect', task.disconnectHandler);

    try {
      debug(`Executing user executor for: ${operationName}`);
      executor(innerResolve, innerReject);
    } catch (err) {
      debug(`Executor threw synchronous error: ${err.message}`);
      innerReject(err);
    }
  });

  outstandingPromise
    .then(
      (value) => {
        debug(`Operation completed successfully: "${operationName}"`);
        cleanup(task, peripheral);
        task.resolve(value);
        processNextTask(peripheral, task.delayMs);
      },
      (reason) => {
        debug(`Operation failed: "${operationName}" - ${reason.message || reason}`);
        cleanup(task, peripheral);
        task.reject(reason);
        processNextTask(peripheral, task.delayMs);
      },
    )
    .catch((err) => {
      debug(`Unexpected error in jealousPromise wrapper: ${err.message}`);
      cleanup(task, peripheral);
      processNextTask(peripheral, task.delayMs);
    });
};

/**
 * Queued Bluetooth operation with optional delay between operations.
 *
 * @param {Object} peripheral - Your noble/peripheral object
 * @param {Function} executor - (resolve, reject) => void
 * @param {string} operationName - Name for debugging
 * @param {number} delayMs - Delay in milliseconds before next operation starts (default: 50)
 */
function jealousPromise(
  peripheral,
  executor,
  operationName = 'unknown operation',
  delayMs = DEFAULT_DELAY_MS,
) {
  const creationStack = new Error(`jealousPromise created for: ${operationName}`).stack;

  debug(`jealousPromise called: "${operationName}" (delay: ${delayMs}ms)`);

  return new Promise((outerResolve, outerReject) => {
    const task = {
      executor,
      operationName,
      creationStack,
      resolve: outerResolve,
      reject: outerReject,
      disconnectHandler: null,
      delayMs: Math.max(0, delayMs), // ensure non-negative
    };

    if (!outstandingPromise) {
      debug('No outstanding operation - starting immediately');
      executeTask(task, peripheral);
    } else {
      operationQueue.push(task);
      debug(`Operation queued: ${operationName} (queue: ${operationQueue.length}, delay: ${delayMs}ms)`);
    }
  });
}

// Optional utilities
function getQueueLength() {
  return operationQueue.length;
}

function clearQueue() {
  operationQueue.length = 0;
}

function setDefaultDelay(ms) {
  DEFAULT_DELAY_MS = Math.max(0, ms);
}

module.exports = {
  jealousPromise,
  getQueueLength,
  clearQueue,
  setDefaultDelay,
};
