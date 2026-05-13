# TAP (Raw C64 Tape Images) Format Specification

## Overview

The TAP format was designed by Per Hakan Sundell (author of CCS64 emulator) in 1997. It attempts to duplicate the data stored on a Commodore cassette tape bit-for-bit. Since it represents the raw serial data from tape, it handles any custom tape loaders including turbo loaders.

TAP images are 8-16x larger than the original PRG file because each bit becomes one byte.

## File Header

The header is exactly 20 bytes (0x14 bytes):

| Offset | Size | Description                                                   |
| ------ | ---- | ------------------------------------------------------------- |
| 0      | 12   | File signature: "C64-TAPE-RAW" (ASCII)                        |
| 12     | 1    | TAP version                                                   |
|        |      | $00 - Original layout                                         |
|        |      | $01 - Updated layout (cycle-exact)                            |
|        |      | $02 - Halfwave extension (C16)                                |
| 13     | 1    | Computer platform                                             |
|        |      | 0 = C64                                                       |
|        |      | 1 = VIC-20                                                    |
|        |      | 2 = C16/Plus/4                                                |
|        |      | 3 = PET                                                       |
|        |      | 4 = C5x0                                                      |
|        |      | 5 = C6x0/C7x0                                                 |
| 14     | 1    | Video standard                                                |
|        |      | 0 = PAL                                                       |
|        |      | 1 = NTSC                                                      |
|        |      | 2 = OLD NTSC                                                  |
|        |      | 3 = PALN                                                      |
| 15     | 1    | Reserved (unused, $00)                                        |
| 16     | 4    | File data size in bytes (little-endian, not including header) |

## Pulse Data Encoding

### Version 0 ($00)

Each byte represents the length of one pulse (time until hardware triggers again):

```
pulse_length (seconds) = (8 * data_byte) / clock_cycles
```

- Data byte $00 represents overflow (pulse longer than 255 \* 8 cycles)
- Maximum pulse: 2040 cycles (255 \* 8)

### Version 1 ($01)

Same as v0, but extended for long pulses:

- When data byte is $00, three additional bytes follow containing the exact pulse length in clock cycles (24-bit, little-endian)
- This allows pulses of any length

### Version 2 ($02)

Halfwave extension for C16 tapes:

- Each value represents a halfwave instead of a full wave
- Data starts with a '0'->'1' transition
- Time encoding same as v1

## Clock Cycles by Platform and Video Standard

| Platform   | Video    | Clock Cycles/sec |
| ---------- | -------- | ---------------- |
| C64 (0)    | PAL (0)  | 985248           |
| C64 (0)    | NTSC (1) | 1022730          |
| VIC-20 (1) | PAL (0)  | 1108405          |
| VIC-20 (1) | NTSC (1) | 1022727          |
| C16 (2)    | PAL (0)  | 886724           |
| C16 (2)    | NTSC (1) | 894886           |
| PET (3)    | PAL (0)  | 1000000          |
| PET (3)    | NTSC (1) | 1000000          |
| C5x0 (4)   | PAL (0)  | 985248           |
| C5x0 (4)   | NTSC (1) | 1022730          |
| C6x0 (5)   | PAL (0)  | 2000000          |
| C6x0 (5)   | NTSC (1) | 2000000          |

Default: PAL C64 = 985248 Hz

## Example Calculations

For PAL C64 with data byte $2F (47 decimal):

```
pulse = (47 * 8) / 985248 = 0.00038975 seconds = 389.75 microseconds
```

Common pulse values:

- Short: $2B (43) = 352 microseconds
- Medium: $3F (63) = 512 microseconds
- Long: $53 (83) = 672 microseconds

## Pulse Threshold Guidelines

From VICE emulation:

- Short pulse: $24-$36 (36-54)
- Medium pulse: $37-$49 (55-73)
- Long pulse: $4A-$64 (74-100)

## Tape Data Interpretation

The C64 ROM tape loader works as follows:

1. Initialize a timer with a specific value
2. Start the timer counting down
3. If tape data changes before timer expires = "0" bit (short pulse)
4. If timer expires first = "1" bit (long pulse)
5. Repeat to decode entire file

## TAP File Structure Example

```
Offset (hex)  Data                       Description
0000          43 36 34 2D 54            "C64-TAPE-RAW" signature
000C          01                          Version 1
000D          00                          C64 platform
000E          00                          PAL video
000F          00                          Reserved
0010          51 21 08 00                Data size: 0x00082151 bytes
0014          (pulse data...)            First pulse length
...           ...                        Subsequent pulses
```

## Conversion Notes

When reading TAP files:

1. Verify signature and version
2. Determine clock rate from platform/video standard
3. Read pulse data as 8-bit values (or 32-bit for v1 when byte=$00)
4. Convert each pulse to microseconds using formula

When writing TAP files:

1. Use v1 format for best accuracy with long pulses
2. Include platform ($00) and video standard ($00) for PAL C64
3. Store pulse data sequentially

## References

- VICE Emulator Documentation: https://vice-emu.sourceforge.io/vice_17.html
- Original TAP specification by Per Hakan Sundell and Markus Brenner
