; Shared symbols for loader.asm (IRQ/sync at $02a7) and loader_header.asm ($0351)

BG_COLOR = $d020
BG_BLANK_ADDR = $d011

ADDR_START_LOW = $61
ADDR_START_HIGH = $62
ADDR_END_LOW = $63
ADDR_END_HIGH = $64
LDR_BIT_ACCUMULATOR = $65
LDR_BIT_COUNTER = $66
LDR_BYTE = $69
LDR_BYTE_SIGNAL = $6a
LDR_CHECKSUM = $6b

loader_header_start = $0351

; Must match waitForByte in loader_header.asm (used by loader.asm at $02a7)
waitForByteRoutine = $03f0
