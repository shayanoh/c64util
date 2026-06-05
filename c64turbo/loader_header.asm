* = $0351

.include "loader_symbols.inc"

loader_irq = $2a9
loader_reSync = $2c9

start:

; Disable interrupts
        sei
        lda #%00000101
        sta $01

; CIA1 ICR: disable ALL CIA interrupts
        lda #$7f
        sta $dc0d
; Clear CIA 1 status
        lda $dc0d

;Install IRQ handler
        lda #<loader_irq
        sta $fffe
        lda #>loader_irq
        sta $ffff

; Read average signal length from DWORD $02A7 into CIA 1 Timer A countdown
        lda $2a7
        sta $dc04
        lda $2a8
        sta $dc05


; Enable Timer A underflow interrupt
        lda #%10010000 ; bit0 timer A, bit4 flag
        sta $dc0d

; Setup Timer A
        lda #%00011001
        sta $dc0e

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

        lda #$00
        sta LDR_BIT_ACCUMULATOR
        lda #$08
        sta LDR_BIT_COUNTER
        lda #$00
        sta LDR_BYTE_SIGNAL

; Enable interrupts
        cli

; Loader ready and running.


dataBlocks:
; Get sync signal
        jsr loader_reSync
; Read following data type
        jsr waitForByte
        cmp #$00
        beq finish
        cmp #$02
        beq prg

error:
        jmp error ; infinite loop... can't do anything


prg:
; read start address
        jsr waitForByte
        sta ADDR_START_LOW
        jsr waitForByte
        sta ADDR_START_HIGH
; read end address
        jsr waitForByte
        sta ADDR_END_LOW
        jsr waitForByte
        sta ADDR_END_HIGH

        ldy #$00
        sty LDR_CHECKSUM

dataLoop:
        inc BG_COLOR
        jsr waitForByte

        sta (ADDR_START_LOW), y
        eor LDR_CHECKSUM
        sta LDR_CHECKSUM

        inc ADDR_START_LOW
        bne +
        inc ADDR_START_HIGH
+

        lda ADDR_START_LOW
        cmp ADDR_END_LOW
        bne dataLoop
        lda ADDR_START_HIGH
        cmp ADDR_END_HIGH
        bne dataLoop

; Validate checksum
        jsr waitForByte
        eor LDR_CHECKSUM
        bne error

        jmp dataBlocks

finish:

        sei

        lda #$37
        sta $01          ; full memory map restored ($37 = BASIC+KERNAL+I/O)

        jsr $fda3        ; KERNAL: restore default I/O vectors ($ff84 IOINIT [Initialize I/O devices])
        jsr $fd15        ; KERNAL: set I/O base (init vectors)  ($ff8a RESTOR [Set the top of RAM])
        jsr $e453        ; KERNAL: init BASIC interpreter

        cli

        ldx #$80         ; X = $80 (RUN flag)
        jmp ($0300)

waitForByte:
        lda LDR_BYTE_SIGNAL
        beq waitForByte
        lda #$00
        sta LDR_BYTE_SIGNAL
        lda LDR_BYTE
        rts


; Should end at most @ $3fb
