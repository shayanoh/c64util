* = $02a7

.include "loader_symbols.inc"

; ***************************************
; IRQ handler
; ***************************************
.byte $ff, $00
irq_handler:
        pha
        txa
        pha

        lda $dc0d ; ack irq

        ldx #%00011001 ; reset timer
        stx $dc0e

; if timer is fired, we have long pulse
; if not fired, we have short pulse

        lsr a ; IRQ is in A, Read first bit into carry - timer A fired signal

; now, if timer has fired, we have long pulse, carry is true, we have one bit
;      if timer hasn't fired, we have short pulse, carry is false, we have zero bit
;   => carry is the bit we wanted to read
        ror LDR_BIT_ACCUMULATOR ; Rotate carry into $02
        dec LDR_BIT_COUNTER
        bne done ; we don't have 8 bits yet
        lda LDR_BIT_ACCUMULATOR
        sta LDR_BYTE ; Save byte
        lda #$08 ; reset bit counter
        sta LDR_BIT_COUNTER
        sta LDR_BYTE_SIGNAL ; signal byte completed
done:
        pla
        tax
        pla
        rti

; ***************************************
; SYNC reader
; ***************************************
reSync:
        lda BG_BLANK_ADDR
        ora #$10
        sta BG_BLANK_ADDR

        lda #$00
        sta BG_COLOR
sync:
        lda LDR_BIT_ACCUMULATOR ; Peek accumulator to sync bit stream
        cmp #$01
        bne sync

        lda #$00
        sta LDR_BYTE_SIGNAL
        lda #$08
        sta LDR_BIT_COUNTER

midSync:
        jsr waitForByteRoutine
        cmp #$01
        beq midSync

        ldx #$09
countDownLoop:
        txa
        cmp LDR_BYTE
        bne reSync
        jsr waitForByteRoutine
        dex
        bne countDownLoop
        cmp #$00
        bne reSync
        rts


; ***************************************
; Hook $300 jump table for auto load
; ***************************************
.fill 3, 0

; We should be at $0300 now.
; BUG: if we fill just up to $30a, the rest will be overwritten by basic stacks and ...
;      so we fill with known values up to and including $0333 so the jump table
;      stays sane

;$0300
.byte $8b, $e3, <loader_header_start, >loader_header_start, $7c, $a5, $1a, $a7, <loader_header_start, >loader_header_start, $86, $ae, $00, $00, $00, $00
;$0310
.byte $4c, $48, $b2, $00, $31, $ea, $66, $fe, $47, $fe, $4a, $f3, $91, $f2, $0e, $f2
;$320
.byte $50, $f2, $33, $f3, $57, $f1, $ca, $f1, $ed, $f6, $3e, $f1, $2f, $f3, $66, $fe
;$330
.byte $a5, $f4, $ed, $f5
