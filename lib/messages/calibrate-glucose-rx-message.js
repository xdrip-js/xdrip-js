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
// this one above is the usual one (cal successful)
// I got this one when I think the cal was rejected
//          3500085daf

// perhaps its something like
// opcode:    35
// something: 00
// status:    00 OK
//            06 second calibration
//            08 rejected - enter another one
//            0b no can do - sensor stopped

// crc:       5daf

// if we try to calibrate when the sensor is stopped:
// 35000b3e9f
