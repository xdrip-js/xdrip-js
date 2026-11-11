// Run `work` and reject with `message` if it has not settled within
// `timeoutMs`. Use inside a SerialOperationQueue executor: the timer is
// cancelled via `addCleanup` when the operation finishes either way.
//
// (Throwing from inside a setTimeout callback does not reject anything; it is
// an uncaught exception that terminates the process.)
function withTimeout(work, timeoutMs, message, addCleanup) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), timeoutMs);
    addCleanup(() => clearTimeout(timer));
    Promise.resolve().then(work).then(resolve, reject);
  });
}

module.exports = withTimeout;
