var crc = require('crc');

module.exports = {
  crc16: function(data) {
    return crc.crc16xmodem(data);
  },
  crcValid: function(data) {
    return (crc.crc16xmodem(data.slice(0, data.length - 2)) == data.readUInt16LE(data.length - 2));
  }
}
