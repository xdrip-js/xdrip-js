const debug = require('debug')('bluetooth-manager');

let outstandingPromise = null;
let currentOperation = null;
const operationQueue = [];

function jealousPromise(peripheral, executor, operationName = "unknown operation") {
  const creationStack = new Error(`jealousPromise created for: ${operationName}`).stack;

  return new Promise((outerResolve, outerReject) => {
    const task = {
      executor,
      operationName,
      creationStack,
      resolve: outerResolve,
      reject: outerReject,
      disconnectHandler: null
    };

    if (!outstandingPromise) {
      // No operation in progress → run immediately
      executeTask(task, peripheral);
    } else {
      // Queue for later
      operationQueue.push(task);
      debug(`Operation queued: ${operationName} (queue length: ${operationQueue.length})`);
    }
  });
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
        resolve(value);           // resolve the caller's promise
        processNextTask(peripheral);
      },
      (reason) => {
        cleanup(task, peripheral);
        reject(reason);           // reject the caller's promise
        processNextTask(peripheral);
      }
    )
    .catch(err => {
      // Safety net
      console.error('Unexpected error in jealousPromise wrapper:', err);
      cleanup(task, peripheral);
      processNextTask(peripheral);
    });
}

function cleanup(task, peripheral) {
  outstandingPromise = null;
  currentOperation = null;
  if (task.disconnectHandler) {
    peripheral.removeListener('disconnect', task.disconnectHandler);
    task.disconnectHandler = null;
  }
}

function processNextTask(peripheral) {
  if (operationQueue.length > 0) {
    const nextTask = operationQueue.shift();
    debug(`Dequeuing next operation: ${nextTask.operationName}`);
    executeTask(nextTask, peripheral);
  }
}

module.exports = jealousPromise;

