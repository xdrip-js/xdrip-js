class CallbackNotifier {
  constructor() {
    this.queue = [];
    this.waiters = [];

    // Arrow function so it can be passed directly as a callback
    this.notify = (data) => {
      if (this.waiters.length > 0) {
        const resolve = this.waiters.shift();
        resolve(data);
      } else {
        this.queue.push(data);
      }
    };
  }

  next() {
    if (this.queue.length > 0) {
      return Promise.resolve(this.queue.shift());
    }
    return new Promise((resolve) => {
      this.waiters.push(resolve);
    });
  }
}

module.exports = CallbackNotifier;
