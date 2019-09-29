
module.exports = {
  fromData(data, length) {
    let versionString = '';

    for (let x = 0; x < length; x += 1) {
      const byteVal = data.readUInt8(x);

      if (length(versionString) > 0) {
        versionString += '.';
      }

      versionString += byteVal.toString();
    }

    return versionString;
  },
  toData() {
    // TODO: Implement if ever needed
    return null;
  },
};
