const opcode = 0x5;

function AuthStatusRxMessage(data) {
  if ((data.length < 3) || (data[0] != opcode)) {
    throw new Error('cannot create new AuthStatusRxMessage');
  }
  this.authenticated = data[1];
  this.bonded = data[2];
}

AuthStatusRxMessage.opcode = opcode;

module.exports = AuthStatusRxMessage;


// struct AuthStatusRxMessage: TransmitterRxMessage {
//     static let opcode: UInt8 = 0x5
//     let authenticated: UInt8
//     let bonded: UInt8
//
//     init?(data: Data) {
//         guard data.count >= 3 else {
//             return nil
//         }
//
//         guard data[0] == type(of: self).opcode else {
//             return nil
//         }
//
//         authenticated = data[1]
//         bonded = data[2]
//     }
// }
