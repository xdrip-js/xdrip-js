const opcode = 0x35;

function CalibrateGlucoseRxMessage(data) {
  if ((data.length !== 5) || (data[0] !== opcode)) {
    throw new Error('cannot create new CalibrateGlucoseRxMessage');
  }

  // TODO: work out what the payload is
  // presumably calibration succeeded / rejected
}

CalibrateGlucoseRxMessage.opcode = opcode;

module.exports = CalibrateGlucoseRxMessage;

// example: 350000552e
