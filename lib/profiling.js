let start = Date.now();

const self = module.exports = {
  now: function() {
    return (Date.now() - start) / 1000;
  },
  reset: function() {
    start = Date.now();
  }
};
