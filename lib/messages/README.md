# Example messages sent from control characteristic to iOS app:
25 00 e91c6500 56a26300 01000000 0b3c --> TransmitterTimeRxMessage
31 00 0c3e0000 e41c6500 6c00 06 00 0320 --> GlucoseRxMessage
33 00 2831009001 3200b400 6900 9b146500 b2af --> CalibrationDataRxMessage
33 00 3328006701 28009900 5a00 fd986500 b8a9
33 00 332c009001 2c00b700 5a00 fd986500 0b3a

I have no idea what this 0x51 message is???

51 00 02010000000000000000000000000000 c417 --> ??
51 00 0101442665006f276500180000003e0d d718
51 00 0100064366003244660018000000adb5 7741

after a calibration...
51 00 02020000000000000000000000000000 e1f4 (all the zeros get reset on a calibration perhaps)


Assume current time = e91c6500 --> reverse 00651ce9 --> decimal 6626537 --> 76.7 days
ASsume calibration time = 9b146500 -- reverse 0065149b --> decimal 6624411 --> 2126 seconds earlier = 35 minutes earlier

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
