
function G6CalibrationParameters(code) {
  this.code=code;

  // defaults
  this.paramA = -1;
  this.paramB = -1;

      switch (code) {
        case "0000": // special null code
		this.paramA = 1;
		this.paramB = 0;
		break;
        case "5915": 
		this.paramA = 3100;
		this.paramB = 3600;
		break;
        case "5917":
                this.paramA = 3000;
                this.paramB = 3500;
		break;
        case "5931":
                this.paramA = 2900;
                this.paramB = 3400;
		break;
        case "5937":
                this.paramA = 2800;
                this.paramB = 3300;
		break;
        case "5951":
                this.paramA = 3100;
                this.paramB = 3500;
		break;
        case "5955":
                this.paramA = 3000;
                this.paramB = 3400;
		break;
        case "7171":
                this.paramA = 2700;
                this.paramB = 3300;
		break;
        case "9117":
                this.paramA = 2700;
                this.paramB = 3200;
		break;
        case "9159":
                this.paramA = 2600;
                this.paramB = 3200;
		break;
        case "9311":
                this.paramA = 2600;
                this.paramB = 3100;
		break;
        case "9371":
                this.paramA = 2500;
                this.paramB = 3100;
		break;
        case "9515":
                this.paramA = 2500;
                this.paramB = 3000;
		break;
        case "9551":
                this.paramA = 2400;
                this.paramB = 3000;
		break;
        case "9577":
                this.paramA = 2400;
                this.paramB = 2900;
		break;
        case "9713":
                this.paramA = 2300;
                this.paramB = 2900;
		break;
      }
}

G6CalibrationParameters.prototype.isValid = function() {
        return (this.paramA > 0); 
};

G6CalibrationParameters.prototype.isNullCode = function() {
	return (this.isValid() && this.paramB == 0);
};

// probably not needed for xdrip-js
G6CalibrationParameters.prototype.checkCode = function(sensor_serial_code) {
	return (new G6CalibrationParameters(sensor_serial_code).isValid());
};

module.exports = G6CalibrationParameters;

