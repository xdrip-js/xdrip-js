// TODO: it might be simple to rewrite the string literals here in lower case
// and without hyphens, but they are a bit easier to read this way
function toLowerCaseAndRemoveHyphens(string) {
  return string.replace(/-/g, '').toLowerCase();
}

function toLowerCaseWithHyphens(string) {
  // force standard 8-4-4-4-12 format
  const u = string.replace(/-/g, '').toLowerCase();
  return `${u.slice(0,8)}-${u.slice(8,12)}-${u.slice(12,16)}-${u.slice(16,20)}-${u.slice(20)}`;
}

const TransmitterService = {
  DeviceInfo: toLowerCaseWithHyphens('180A'),
  Advertisement: toLowerCaseWithHyphens('FEBC'),
  CGMService: toLowerCaseWithHyphens('F8083532-849E-531C-C594-30F1F86A4EA5'),
  ServiceB: toLowerCaseWithHyphens('F8084532-849E-531C-C594-30F1F86A4EA5'),
};

const CGMServiceCharacteristic = {
  Communication: toLowerCaseWithHyphens('F8083533-849E-531C-C594-30F1F86A4EA5'),
  Control: toLowerCaseWithHyphens('F8083534-849E-531C-C594-30F1F86A4EA5'),
  Authentication: toLowerCaseWithHyphens('F8083535-849E-531C-C594-30F1F86A4EA5'),
  Backfill: toLowerCaseWithHyphens('F8083536-849E-531C-C594-30F1F86A4EA5'),
  ExtraData: toLowerCaseWithHyphens('F8083538-849E-531C-C594-30F1F86A4EA5'),
};

module.exports = {
  TransmitterService,
  CGMServiceCharacteristic,
};
