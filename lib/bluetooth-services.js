// TODO: it might be simple to rewrite the string literals here in lower case
// and without hyphens, but they are a bit easier to read this way
const TransmitterService = {
  DeviceInfo: toLowerCaseAndRemoveHyphens('180A'),
  Advertisement: toLowerCaseAndRemoveHyphens('FEBC'),
  CGMService: toLowerCaseAndRemoveHyphens('F8083532-849E-531C-C594-30F1F86A4EA5'),
  ServiceB: toLowerCaseAndRemoveHyphens('F8084532-849E-531C-C594-30F1F86A4EA5')
};

const CGMServiceCharacteristic = {
  Communication: toLowerCaseAndRemoveHyphens('F8083533-849E-531C-C594-30F1F86A4EA5'),
  Control: toLowerCaseAndRemoveHyphens('F8083534-849E-531C-C594-30F1F86A4EA5'),
  Authentication: toLowerCaseAndRemoveHyphens('F8083535-849E-531C-C594-30F1F86A4EA5'),
  Backfill: toLowerCaseAndRemoveHyphens('F8083536-849E-531C-C594-30F1F86A4EA5')
};

function toLowerCaseAndRemoveHyphens(string) {
  return string.replace(/-/g, '').toLowerCase();
}

module.exports = {
  TransmitterService,
  CGMServiceCharacteristic
};
