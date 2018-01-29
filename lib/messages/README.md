# Notes

## Example messages sent from control characteristic to iOS app:
```
25 00 e91c6500 56a26300 01000000 0b3c --> TransmitterTimeRxMessage
31 000c3e0000 e41c6500 6c00 06 00 0320 --> GlucoseRxMessage
33 00 28 3100 9001 3200 b400 6900 9b146500 b2af --> CalibrationDataRxMessage

// these two have the same calibration time:
33 00 33 2800 6701 2800 9900 5a00 fd986500 b8a9
33 00 33 2c00 9001 2c00 b700 5a00 fd986500 0b3a

// so do these two:
33 00 35 3b00 9001 5600 f300 9400 d7476600 ec95
33 00 35 2900 8501 3b00 d100 9400 d7476600 caab

// when sensor stopped
33 00 00 1400 5802 1400 5802 0000 00000000 82f5

25 00 fc945200 4cbf4d00 01000000 ad5b --> time message
33 00 35 3800 9001 3800 e600 cb00 3bce5100 2058 --> calibration message (100)
33 00 35 3b00 9001 3b00 e900 cb00 3bce5100 8ebd --> the next one (glucose 104)
33 00 35 3a00 9001 3a00 e800 cb00 3bce5100 79ee --> and the next (glucose 102)
33 00 35 3300 9001 3300 e000 cb00 3bce5100 a745 --> and the next (glucose 95)
33 00 35 3400 9001 3400 e100 cb00 3bce5100 886e --> and the next (glucose 96)
33 00 35 3100 9001 3100 de00 cb00 3bce5100 22b5 --> and the next (glucose 93)
33 00 35 2d00 9001 2d00 da00 cb00 3bce5100 9e19 --> (glucose 89)
33 00 35 3300 9001 3300 e100 cb00 3bce5100 7402 --> (glucose 95)
33 00 35 3000 9001 3000 dd00 cb00 3bce5100 7369 --> (glucose 91)
33 00 35 3200 9001 3200 e000 cb00 3bce5100 8351 --> (glucose 94

--> after another calibration
33 00 35 4200 9001 4200 cf00 7e00 d79e5300 f617 --> (glucose 124, unfiltered 183520, filtered 189760)
33 00 35 4200 9001 4200 cf00 7e00 d79e5300 f617 --> (glucose 115, unfiltered 172416, filtered 183584)
33 00 35 4b00 9001 4b00 e200 7e00 d79e5300 fe8f --> (glucose 128, unfiltered 187136, filtered 179840)
33 00 35 3f00 9001 3f00 ca00 7e00 d79e5300 da15

--> after another calibration
33 00 35 7e00 9001 7e00 5401 cf00 0d6a5400 bf66

--> during warmup
33 00 00 1400 5802 1400 5802 0000 00000000 82f5
33 00 00 4c00 9001 2800 9001 0000 00000000 fe60 --> when first calibration is due
33 00 1c 4700 9001 6500 1401 b000 e4cb5500 7d6e --> after two calibrations (the last one was 176 (0xb0))
```
0x51 is backfill confirmation.
51 00 02010000000000000000000000000000 c417 --> ??
51 00 0101442665006f276500180000003e0d d718
51 00 0100064366003244660018000000adb5 7741

after a calibration...
51 00 02020000000000000000000000000000 e1f4 (all the zeros get reset on a calibration perhaps)

## Interpreting timestamps
Assume current time = `e91c6500` --> reverse `00651ce9` --> decimal `6626537` --> 76.7 days
Assume calibration time = `9b146500` -- reverse `0065149b` --> decimal `6624411` --> 2126 seconds earlier = 35 minutes earlier

# Example messages sent from ProbablyBackfill characteristic to iOS app:
03 00 7ba26500 6000 0606 a7a36500 5c00 06ff
03 c0 be4e6600 7f00 06f8
[opcode status, timestamp, glucose, ??, timestamp, glucose, crc]

02 00 0702 (could this be the backfill command?)
01 00 083f0000324466005b00 0702

# what happens on the control characteristic just after a calibration?
## raw rx data:
2500e848660056a26300010000001ece
350000552e
310000000000e84866008840060d5fec
3300353b0090015600f3009400d7476600ec95
510001005e456600e24866002800000008b91c73

## inferred commands
--> TransmitterTimeTxMessage (0x24)
<-- TransmitterTimeRxMessage (0x25)
--> CalibrationTxMessage (0x34)
<-- CalibrationRxMessage (0x35)
--> GlucoseTxMessage (0x30)
<-- GlucoseRxMessage (0x31)
--> CalibrationDataTxMessage (0x32)
<-- CalibrationDataRxMessage (0x33)
--> UnknownTxMessage (0x50)
<-- UnknownRxMessage (0x51)

# a sequence of backfill values:
0100093f00005e456600630007088a4666006b00
0200070db64766007200070fe24866007400070c

# another backfill sequence:
01 c0133f0000 16516600 700006f1 42526600 6f00
02c006f5

## closer look at 01c0133f000016516600700006f1425266006f00
01        opcode
c0133f0000
16516600  timestamp
7000      guessing that this is glucose (= 112)
06f1
42526600  timestamp (same as the timestamp in the glucose message)
6f00      guessing that this is glucose (= 111)

first timestamp reversed --> 665116 --> 6705430 decimal
second                   --> 665242 --> 6705730 decimal
                                            300 difference
                                            = 5 minutes

# after dex app was turned off for ~ 5 mins:
// control
2500d25c660056a2630001000000d68e
310000000000ce5c6600690006fc8cf1
330035290085013b00d1009400d7476600caab

// all backfill
01 80 f93e0000 9e326600 5700 0602 ca336600 5c00
02 80 0606 f6346600 5f00 0608 22366600 6600 060a
03 80 4e376600 6400 0606 7a386600 6300 0603 a639
0480660063000600d23a6600610006fefe3b6600
0580610006fe2a3d6600610006ff563e66006100
06800600823f66005d0006feae406600570006fa
0780da416600550007f906436600580007fc3244
088066005b0007025e456600630007088a466600
09806b00070db64766007200070fe24866007400
0a80070c0e4a6600880006073a4b660090000608
0b80664c66008e000604924d660089000600be4e
0c8066007f0006f8ea4f6600790006f316516600
0d80700006f1425266006f0006f56e5366006d00
0e8006f99a546600660006f9c6556600650006fa
0f80f2566600680006fd1e586600700006044a59
1080660070000606765a66006e000603a25b6600
1180680006fdce5c6600690006fc

// control
510001029e326600ce5c66004e01000012416502

## backfill format:
repeated sequences of timestamp --> glucose --> status --> trend

## deciphering 51 messages
examples:
51 00 0201 00000000 00000000 0000 0000 0000 c417
51 00 0101 44266500 6f276500 1800 0000 3e0d d718 --> (6629231 - 6628932) = 5 minutes (almost)
51 00 0100 06436600 32446600 1800 0000 adb5 7741 --> (6702130 - 6701830) = 5 minutes
51 00 0202 00000000 00000000 0000 0000 0000
51 00 0100 5e456600 e2486600 2800 0000 08b9 1c73 --> (6703330 - 6702430) = 15 minutes
51 00 0102 9e326600 ce5c6600 4e01 0000 1241 6502 --> (6708430 - 6697630) = 180 minutes

[ opcode | success | ?? | startTime | endTime | ?? | ?? | ?? | crc ]
