

*= $0351

!address {
  BG_COLOR = $D020
  BG_BLANK_ADDR = $D011

  ADDR_START_LOW = $61
  ADDR_START_HIGH = $62
  ADDR_END_LOW = $63
  ADDR_END_HIGH = $64
  LDR_BIT_ACCUMULATOR = $65
  LDR_BIT_COUNTER = $66
  LDR_BYTE = $69
  LDR_BYTE_SIGNAL = $6a
  LDR_CHECKSUM = $6b
  
  loader_irq = $2A9
  loader_reSync = $2C9
}
start:

; Disable interrupts
SEI
LDA #%00000101
STA $01

; CIA1 ICR: disable ALL CIA interrupts
LDA #$7F
STA $DC0D
; Clear CIA 1 status
LDA $DC0D
    
;Install IRQ handler
LDA #<loader_irq;#<irq_handler
STA $FFFE
LDA #>loader_irq;#>irq_handler
STA $FFFF

; Read average signal length from DWORD $02A7 into CIA 1 Timer A countdown
LDA $2A7
STA $DC04
LDA $2A8
STA $DC05


; Enable Timer A underflow interrupt
LDA #%10010000 ; bit0 timer A, bit4 flag
STA $DC0D

; Setup Timer A
LDA #%00011001
STA $DC0E

;$DC0E: Timer A control
;Bit 0: 0 = Stop timer; 1 = Start timer
;Bit 1: 1 = Indicates a timer underflow at port B in bit 6.
;Bit 2: 0 = Through a timer overflow, bit 6 of port B will get high for one cycle , 1 = Through a timer underflow, bit 6 of port B will be inverted
;Bit 3: 0 = Timer-restart after underflow (latch will be reloaded), 1 = Timer stops after underflow.
;Bit 4: 1 = Load latch into the timer once.
;Bit 5: 0 = Timer counts system cycles, 1 = Timer counts positive slope at CNT-pin
;Bit 6: Direction of the serial shift register, 0 = SP-pin is input (read), 1 = SP-pin is output (write)
;Bit 7: Real Time Clock, 0 = 60 Hz, 1 = 50 Hz


; setup loader variables

LDA #$00
STA LDR_BIT_ACCUMULATOR
LDA #$08
STA LDR_BIT_COUNTER
LDA #$00
STA LDR_BYTE_SIGNAL

; Enable interrupts
CLI

; Loader ready and running. 


dataBlocks:
; Get sync signal
JSR loader_reSync
; Read following data type
JSR waitForByte
CMP #$00
BEQ finish
CMP #$02
BEQ prg

error:
JMP error ; infinite loop... can't do anything


prg:
; read start address
JSR waitForByte
STA ADDR_START_LOW
JSR waitForByte
STA ADDR_START_HIGH
; read end address
JSR waitForByte
STA ADDR_END_LOW
JSR waitForByte
STA ADDR_END_HIGH

LDY #$00
STY LDR_CHECKSUM

@dataLoop:
INC BG_COLOR
JSR waitForByte

STA (ADDR_START_LOW),Y
EOR LDR_CHECKSUM
STA LDR_CHECKSUM

INC ADDR_START_LOW
BNE +
INC ADDR_START_HIGH
+

LDA ADDR_START_LOW
CMP ADDR_END_LOW
BNE @dataLoop
LDA ADDR_START_HIGH
CMP ADDR_END_HIGH
BNE @dataLoop

; Validate checksum
JSR waitForByte
EOR LDR_CHECKSUM
BNE error

JMP dataBlocks

finish:

SEI

LDA #$37
STA $01          ; full memory map restored ($37 = BASIC+KERNAL+I/O)

JSR $FDA3        ; KERNAL: restore default I/O vectors ($ff84 IOINIT [Initialize I/O devices])
JSR $FD15        ; KERNAL: set I/O base (init vectors)  ($ff8a RESTOR [Set the top of RAM])
JSR $E453        ; KERNAL: init BASIC interpreter

CLI

LDX #$80         ; X = $80 (RUN flag)
JMP ($0300)

waitForByte:
LDA LDR_BYTE_SIGNAL
BEQ waitForByte
LDA #$00
STA LDR_BYTE_SIGNAL
LDA LDR_BYTE
RTS


; Should end at most @ $3fb