var start = Date.now();

var self = module.exports = {
  now: function() {
    return (Date.now() - start) / 1000;
  }
};
