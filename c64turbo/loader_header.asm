

*= $0351

!address {
  BG_COLOR = $D020
  LDR_BIT_ACCUMULATOR = $02
  LDR_BIT_COUNTER = $03
  LDR_BYTE = $04
  LDR_BYTE_SIGNAL = $05
  LDR_CHECKSUM = $06
  
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

; Store 0xff in CIA 1 Timer A countdown, it's the average signal length
LDA $2A7;LDA #$FF
STA $DC04
LDA $2A8;LDA #$00
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
; Get sync signal

JSR loader_reSync;reSync

dataBlocks:
; Read following data type
JSR waitForByte;waitForByte
CMP #$00
BEQ finish
CMP #$02
BEQ prg

error:
JMP error ; infinite loop... can't do anything


prg:
; read start address
JSR waitForByte
STA $10
JSR waitForByte
STA $11
; read end address
JSR waitForByte
STA $12
JSR waitForByte
STA $13

LDY #$00
STY LDR_CHECKSUM

@dataLoop:
INC BG_COLOR
JSR waitForByte

STA ($10),Y
EOR LDR_CHECKSUM
STA LDR_CHECKSUM

INC $10
BNE +
INC $11
+

LDA $10
CMP $12
BNE @dataLoop
LDA $11
CMP $13
BNE @dataLoop

; Validate checksum
JSR waitForByte
EOR LDR_CHECKSUM
BEQ error

JMP dataBlocks

finish:
SEI
LDA #$37
STA $01          ; full memory map restored ($37 = BASIC+KERNAL+I/O)

JSR $FDA3        ; KERNAL: restore default I/O vectors
JSR $FD15        ; KERNAL: set I/O base (init vectors)
JSR $E453        ; KERNAL: init BASIC interpreter
LDX #$80         ; checksum OK → X = $80 (RUN flag)

CLI
JMP ($0300)

waitForByte:
LDA LDR_BYTE_SIGNAL
BEQ waitForByte
LDA #$00
STA LDR_BYTE_SIGNAL
LDA LDR_BYTE
RTS


; Shoulld end at most @ $3fb