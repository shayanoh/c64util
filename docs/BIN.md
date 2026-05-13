# BIN (Binary Data) Format Specification

## Overview

The BIN format extracts the raw binary data from a T64 tape image. This is the actual program/file data that would be loaded by the C64 when reading from cassette.

## File Format

### Structure

The binary file contains the raw data bytes from each file entry in the T64 image, concatenated together.

| Aspect         | Specification  |
| -------------- | -------------- |
| Format         | Raw binary     |
| Byte order     | Little-endian  |
| No header      | Pure data only |
| File extension | .bin           |

## Data Extraction

### From T64 Directory Entry

Each T64 file entry contains:

- **Start address**: Memory address where data loads (2 bytes, little-endian)
- **End address**: End address (2 bytes, little-endian)
- **Data**: Raw bytes

The actual file data size:

```
data_size = end_address - start_address
```

### Combined Output

When multiple files exist in T64:

```
output = file1_data + file2_data + ... + fileN_data
```

## Standard Load Address

| File Type     | Default Load Address |
| ------------- | -------------------- |
| BASIC program | $0801                |
| Machine code  | Specified in header  |

## Example

If T64 contains:

- File 1: PRG "HELLO", start=$0801, end=$0850, data=79 bytes
- File 2: PRG "WORLD", start=$1000, end=$1200, data=512 bytes

Output BIN file:

- Bytes 0-78: "HELLO" program data
- Bytes 79-590: "WORLD" program data

## Header Information (Optional)

Some BIN writers include a 8-byte header before the data:

| Offset | Size | Description                                     |
| ------ | ---- | ----------------------------------------------- |
| 0      | 2    | Start address (little-endian)                   |
| 2      | 2    | End address (little-endian)                     |
| 4      | 2    | Execution address (optional, $0000 if not used) |
| 6      | 2    | Reserved                                        |

This tool outputs pure binary without header by default.

## Conversion Notes

When extracting from T64:

1. Read directory entries
2. For each file entry:
   - Get start and end addresses
   - Calculate data length
   - Read that many bytes from file data section
3. Concatenate all file data in directory order

When loading to C64:

- LOAD "filename",8,1 loads to address specified in first 2 bytes
- Or use addresses from T64 directory

## Use Cases

1. **Direct loading**: Load .bin directly to C64 memory
2. **Disassembly**: Feed to disassembler/analyzer
3. **Transfer**: Move data to other systems
4. **Backup**: Archive individual files from T64

## Related Formats

- T64: Container format with directory and metadata
- PRG: Commodore program format with load address (2-byte header)
