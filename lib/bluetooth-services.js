const TransmitterService = {
  DeviceInfo: "180A",
  Advertisement: "FEBC",
  CGMService: removeHyphens("F8083532-849E-531C-C594-30F1F86A4EA5"),
  ServiceB: removeHyphens("F8084532-849E-531C-C594-30F1F86A4EA5")
};

const CGMServiceCharacteristic = {
  Communication: removeHyphens('F8083533-849E-531C-C594-30F1F86A4EA5'),
  Control: removeHyphens('F8083534-849E-531C-C594-30F1F86A4EA5'),
  Authentication: removeHyphens('F8083535-849E-531C-C594-30F1F86A4EA5'),
  ProbablyBackfill: removeHyphens('F8083536-849E-531C-C594-30F1F86A4EA5')
};

function removeHyphens(string) {
  return string.replace(/-/g, "");
}

module.exports = {
  TransmitterService,
  CGMServiceCharacteristic
};
