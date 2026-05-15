# WAV Audio Format Specification

## Overview

This document specifies the WAV file format for outputting C64 tape data as
audio. The converter outputs mono WAV files at 48kHz sample rate (default),
8-bit depth.

## File Format Details

### WAV File Structure

```
RIFF header (12 bytes)
  - "RIFF" (4 bytes)
  - File size - 8 (4 bytes, little-endian)
  - "WAVE" (4 bytes)

fmt chunk (24 bytes)
  - "fmt " (4 bytes)
  - Chunk size: 16 (4 bytes, little-endian)
  - Audio format: 1 = PCM (2 bytes)
  - Number of channels: 1 = mono (2 bytes)
  - Sample rate: 44100 (4 bytes)
  - Byte rate: 44100 (4 bytes)
  - Block align: 1 (2 bytes)
  - Bits per sample: 8 (2 bytes)

data chunk (8 bytes + samples)
  - "data" (4 bytes)
  - Data size (4 bytes, little-endian)
  - Audio samples (8-bit unsigned)
```

### Technical Parameters

| Parameter      | Value           |
| -------------- | --------------- |
| Sample Rate    | 48000 Hz        |
| Bit Depth      | 8-bit unsigned  |
| Channels       | 1 (mono)        |
| Byte Rate      | 48000 bytes/sec |
| Block Align    | 1               |
| File Extension | .wav            |

## Commodore 64 Tape Signal Encoding

### How C64 Stores Data on Tape

The Commodore 64 uses a unique encoding system for storing data on cassette
tape:

1. **Square Wave Pulses**: Data is encoded as a sequence of square waves with
   50% duty cycle
2. **Pulse Pairing**: Pulses are always interpreted in pairs
3. **Three Pulse Types**: Short, Medium, and Long pulses encode data

### Pulse Types (Standard Commodore Format)

| Pulse Type | Frequency | Period           | TAP Value (PAL) |
| ---------- | --------- | ---------------- | --------------- |
| Short      | 2840 Hz   | 352 microseconds | ~$2B (43)       |
| Medium     | 1953 Hz   | 512 microseconds | ~$3F (63)       |
| Long       | 1488 Hz   | 672 microseconds | ~$53 (83)       |

### Pulse Pair Encoding

Each pulse pair represents different information:

| First Pulse | Second Pulse | Meaning                             |
| ----------- | ------------ | ----------------------------------- |
| Long        | Medium       | Start of new byte (new-data marker) |
| Long        | Short        | End of data block                   |
| Short       | Medium       | Bit 0                               |
| Medium      | Short        | Bit 1                               |

### Byte Structure (20 pulses total)

Each byte is encoded as 10 pulse pairs:

1. New-data marker (L,M) - start of byte
2. 8 data bits (LSbF - least significant bit first)
3. 1 parity bit (odd parity)
4. Total: 20 pulses per byte

### Complete File Structure on Tape

A complete program on tape follows this structure:

1. **Pilot Tone**: ~27136 short pulses (for header), ~5376 (for data)
2. **Header Block**: 9+192+1 bytes (sync + filename info + checksum)
3. **End Of Block**: End of data block marker
4. **Pilot Tone**: 79 short pulses
5. **Header Repeated**: Same header again
6. **End Of Block**: End of data block marker
7. **Pilot Tone**: 78 short pulses
8. **Pause**: ~300ms silence
9. **Pilot Tone**: 5376 short pulses
10. **Data Block**: Program data + checksum
11. **End Of Block**: End of data block marker
12. **Pilot Tone**: 79 short pulses
13. **Data Repeated**: Same data again
14. **End Of Block**: End of data block marker

### Data Redundancy

Commodore tapes write everything twice:

- Header block: written, then repeated
- Data block: written, then repeated
- This provides basic error correction

### Header Block Format (192 bytes)

Sync bytes before each block (header or data): $89 $88 $87 $86 $85 $84 $83 $82
$81

| Bytes  | Description                                               |
| ------ | --------------------------------------------------------- |
| 1      | File type ($01=BASIC, $02=SEQ, $03=PRG, $04=SEQ, $05=EOF) |
| 2-3    | Start address (little-endian)                             |
| 4-5    | End address (little-endian)                               |
| 6-21   | Filename (16 bytes, padded with $20)                      |
| 21-192 | Unused/reserved                                           |

Note: Repeated blocks use $09-$01 instead of $89-$81 for sync.

## WAV Signal Generation

### Converting TAP to WAV

When converting TAP pulse data to WAV audio:

1. **Calculate Sample Count**: For each TAP byte, calculate samples for both
   high and low half of the pulse

    ```
    half_samples = (pulse_length_seconds * sample_rate) / 2
    ```

2. **Generate Square Wave**:
    - Alternate between high (0xFF) and low (0x00) values
    - Each half of the pulse should be equal length

3. **Signal Parameters**:
    - High level: 0xFF (255) - 8-bit max
    - Low level: 0x00 (0) - 8-bit min
    - Transition: Sharp (instantaneous)

### Example Signal Generation

For a pulse length of 512 microseconds at 48kHz:

```
samples_per_half = (512e-6 * 48000) / 2 = 12.288 ≈ 12 samples
```

Each half-wave = 11 samples at 0xFF or 0x00

## Implementation Notes

### TAP Value to Samples Conversion

```python
def tap_to_samples(tap_value, clock_cycles=985248, sample_rate=48000):
    """Convert TAP byte value to number of samples (both half-waves)"""
    if tap_value == 0:
        return 0  # Overflow - handled separately for v1
    pulse_seconds = (tap_value * 8) / clock_cycles
    total_samples = int(pulse_seconds * sample_rate)
    return max(total_samples, 1)  # Minimum 1 sample
```

### Generating WAV Data

```python
def generate_byte_wave(byte_value, parity_bit, pilot_tones=0):
    """Generate full wave for a complete byte including markers"""
    # This is a simplified representation
    # Actual implementation needs full pilot/M/D/S sequence

    wave = []

    # Add pilot tone if needed
    if pilot_tones > 0:
        wave.extend([0xFF, 0x00] * pilot_tones * 4)  # Short pulses

    # New data marker (Long, Medium)
    wave.extend(generate_pulse(LONG_FREQ))
    wave.extend(generate_pulse(MEDIUM_FREQ))

    # 8 data bits (LSb first)
    for i in range(8):
        if byte_value & (1 << i):
            wave.extend(generate_pulse(LONG_FREQ))
            wave.extend(generate_pulse(SHORT_FREQ))
        else:
            wave.extend(generate_pulse(SHORT_FREQ))
            wave.extend(generate_pulse(MEDIUM_FREQ))

    # Parity bit
    if parity_bit:
        wave.extend(generate_pulse(LONG_FREQ))
        wave.extend(generate_pulse(SHORT_FREQ))
    else:
        wave.extend(generate_pulse(SHORT_FREQ))
        wave.extend(generate_pulse(MEDIUM_FREQ))

    return wave
```

## Hardware Considerations

### Reading from Tape

When playing WAV back to C64:

1. Play at original speed (do not change sample rate)
2. Ensure proper phase - C64 triggers on falling edge (high-to-low)
3. Volume should be at original recording level

### Signal Polarity

- C64 READ line triggers on negative edge (1->0 transition)
- When recording: signal passes through inverter in Datasette
- This means what C64 sees is inverted from what's on tape

### Quality Requirements

- Use high sample rate (48kHz) for accurate pulse timing
- 8-bit is sufficient (C64 uses 1-bit conversion internally)
- Mono is required (C64 has single-channel tape input)

## File Size Calculation

Expected WAV file size for a given TAP file:

```
estimated_samples = sum(tap_bytes) * (8/clock_cycles) * sample_rate * 2
wav_size = 44 + estimated_samples  # + header size
```

For reference: A 100KB TAP file produces approximately a 3-5 minute WAV at
48kHz.

## References

- VICE Emulator Documentation: https://vice-emu.sourceforge.io/vice_17.html
- "Simon's Mostly Reliable Guide to the Commodore Tape Format"
- Analysis of C64 tape loaders by Luigi Di Fraia (2015)
- Computer TAP format: http://computerbrains.com/tapformat.html
