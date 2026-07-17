const opcode = 0x59;

function BackfillControlRxMessage(data) {
  let offset = 11;

  this.backfill_start = data.readUInt32LE(offset);
  offset += 4;

  this.backfill_end = data.readUInt32LE(offset);
}

BackfillControlRxMessage.opcode = opcode;

module.exports = BackfillControlRxMessage;
