# PRG Program File Format Specification

## Overview

The PRG format is the standard Commodore 64 program file format. It contains a
2-byte load address header followed by the raw program data. This tool supports
both reading and writing PRG files.

## File Structure

### Standard PRG (.prg)

| Offset | Size | Description                  |
| ------ | ---- | ---------------------------- |
| 0      | 2    | Load address (little-endian) |
| 2      | N    | Program data                 |

The load address specifies where in C64 memory the program should be loaded.

### P00 Format (.p00)

The P00 format is a PRG variant with additional metadata:

| Offset | Size | Description                  |
| ------ | ---- | ---------------------------- |
| 0      | 7    | Signature: "C64File"         |
| 7      | 1    | Reserved                     |
| 8      | 18   | Filename (space-padded)      |
| 26     | 2    | Load address (little-endian) |
| 28     | N    | Program data                 |

## Load Addresses

Common load addresses for C64 programs:

| Address | Description              |
| ------- | ------------------------ |
| $0801   | BASIC programs (default) |
| $0C00   | Machine code (common)    |
| $1000   | Machine code (common)    |
| $2000   | Machine code/sprites     |
| $4000   | Machine code/sprites     |
| $6000   | Machine code             |
| $8000   | Machine code             |
| $A000   | Machine code             |
| $C000   | Machine code             |

## Reading PRG Files

When reading a PRG file:

1. Detect file type by extension (.prg or .p00)
2. For .p00: verify "C64File" signature, skip 26-byte header
3. For .prg: read load address from first 2 bytes
4. Extract filename from file path (.prg) or header (.p00)
5. Return single file entry with type "PRG"

## Writing PRG Files

When writing a PRG file:

1. Only single file output is supported
2. Write 2-byte load address (little-endian)
3. Write program data bytes
4. No P00 metadata is written (standard PRG only)

## BASIC Program Structure

BASIC programs loaded at $0801 have a specific structure:

| Offset from $0801 | Description                 |
| ----------------- | --------------------------- |
| 0-1               | Link to next line (0 = end) |
| 2-3               | Line number (little-endian) |
| 4                 | BASIC token                 |
| ...               | Line content                |

## Conversion Notes

- PRG files contain only one program
- When converting from T64/D64, select the specific file to extract
- Load address must be preserved for the program to run correctly

## References

- C64 Wiki: https://www.c64-wiki.com/wiki/PRG
- VICE Emulator Documentation
