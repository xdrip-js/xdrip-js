function AuthStatusRxMessage(data) {
  this.data = data;
  this.toString = function() {
    return data.toString('hex');
  }
  console.log('data is ' + data.length + ' bytes long')
  throw new Error('cannot create new AuthStatusRxMessage');
}

module.exports = AuthStatusRxMessage;
