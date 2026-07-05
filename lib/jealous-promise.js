// jealousPromise.js

const debug = require('debug')('bluetooth-manager');

let outstandingPromise = null;
let currentOperation = null;
const operationQueue = [];

/**
 * Default delay (in ms) between completion of one operation and start of the next.
 * You can override this when calling jealousPromise.
 */
const DEFAULT_DELAY_MS = 50;   // Adjust as needed for your Bluetooth device

function cleanup(task, peripheral) {
  outstandingPromise = null;
  currentOperation = null;
  if (task?.disconnectHandler) {
    peripheral.removeListener('disconnect', task.disconnectHandler);
    task.disconnectHandler = null;
  }
}

function processNextTask(peripheral, delayMs = DEFAULT_DELAY_MS) {
  if (operationQueue.length === 0) return;

  const nextTask = operationQueue.shift();

  if (delayMs > 0) {
    debug(`Waiting ${delayMs}ms before next operation: ${nextTask.operationName}`);
    setTimeout(() => {
      executeTask(nextTask, peripheral);
    }, delayMs);
  } else {
    executeTask(nextTask, peripheral);
  }
}

function executeTask(task, peripheral) {
  const { executor, operationName, creationStack, resolve, reject } = task;

  outstandingPromise = new Promise((innerResolve, innerReject) => {
    currentOperation = {
      name: operationName,
      stack: creationStack,
      timestamp: Date.now()
    };

    task.disconnectHandler = () => {
      innerReject(new Error(`Transmitter disconnected during: ${operationName}`));
    };

    peripheral.once('disconnect', task.disconnectHandler);

    try {
      executor(innerResolve, innerReject);
    } catch (err) {
      innerReject(err);
    }
  });

  outstandingPromise
    .then(
      (value) => {
        cleanup(task, peripheral);
        resolve(value);
        processNextTask(peripheral, task.delayMs);   // use per-task delay
      },
      (reason) => {
        cleanup(task, peripheral);
        reject(reason);
        processNextTask(peripheral, task.delayMs);
      }
    )
    .catch(err => {
      console.error('Unexpected error in jealousPromise wrapper:', err);
      cleanup(task, peripheral);
      processNextTask(peripheral, task.delayMs);
    });
}

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
  operationName = "unknown operation",
  delayMs = DEFAULT_DELAY_MS
) {
  const creationStack = new Error(`jealousPromise created for: ${operationName}`).stack;

  return new Promise((outerResolve, outerReject) => {
    const task = {
      executor,
      operationName,
      creationStack,
      resolve: outerResolve,
      reject: outerReject,
      disconnectHandler: null,
      delayMs: Math.max(0, delayMs)   // ensure non-negative
    };

    if (!outstandingPromise) {
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
