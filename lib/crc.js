const crc = require('crc');

module.exports = {
  crc16(data) {
    return crc.crc16xmodem(data);
  },
  crcValid(data) {
    return (crc.crc16xmodem(data.slice(0, data.length - 2)) === data.readUInt16LE(data.length - 2));
  },
};
