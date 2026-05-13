# TXT (Pulse Lengths Text) Format Specification

## Overview

The TXT format outputs the TAP pulse data as a simple text list of decimal pulse lengths. This is useful for debugging, analysis, and understanding the raw pulse data.

## File Format

### Structure

Each line contains one pulse length value in decimal format:

```
<pulse_length>
<pulse_length>
<pulse_length>
...
```

### Format Details

| Aspect        | Specification                               |
| ------------- | ------------------------------------------- |
| Encoding      | Plain text, ASCII                           |
| Line ending   | Unix (LF / \n)                              |
| Number format | Decimal (base 10)                           |
| Value range   | 0-255 (v0) or 0-16777215 (v1 with overflow) |

### Special Values

- **Regular value**: Direct TAP byte value (0-255)
- **$00 (0) with version 1**: Indicates overflow - next 3 bytes contain 24-bit pulse length in clock cycles

## Example

A short sequence of pulses might look like:

```
43
43
43
43
63
83
63
43
43
2000
```

Where:

- 43 = Short pulse (352 microseconds at PAL)
- 63 = Medium pulse (512 microseconds at PAL)
- 83 = Long pulse (672 microseconds at PAL)
- 2000 = 2000 clock cycles (overflow case in version 1, decoded from 3+1 bytes in TAP)

## Conversion Notes

When converting TAP to TXT:

1. Read TAP header to determine version
2. Read each data byte sequentially
3. For version 1: when byte = 0, read next 3 bytes as 24-bit value
4. Output each value on a new line

When converting TXT to TAP:

1. Read each line as integer
2. If value >= 255, encode as 00 byte + 3 bytes encoded integer
3. Else, encode as single byte
4. Write TAP file with appropriate header

## Use Cases

1. **Debugging**: Inspect raw pulse timings visually
2. **Analysis**: Plot pulse length distributions
3. **Manual editing**: Modify pulse timings in text editor
4. **Compression**: Apply custom text compression
5. **Conversion**: Intermediate format for other tools

## Related Formats

- TAP files store the same data in binary form
- WAV files convert pulse data to audio waveforms
