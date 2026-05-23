*= $02A7

; ***************************************
; IRQ handler
; ***************************************
!byte $FF,$00
irq_handler:
PHA
TXA
PHA

LDA $DC0D ; ack irq

LDX #%00011001 ; reset timer
STX $DC0E

; if timer is fired, we have long pulse
; if not fired, we have short pulse

LSR ; IRQ is in A, Read first bit into carry - timer A fired signal

; now, if timer has fired, we have long pulse, carry is true, we have one bit
;      if timer hasn't fired, we have short pulse, carry is false, we have zero bit
;   => carry is the bit we wanted to read
ROR LDR_BIT_ACCUMULATOR ; Rotate carry into $02
DEC LDR_BIT_COUNTER
BNE done ; we don't have 8 bits yet
LDA LDR_BIT_ACCUMULATOR
STA LDR_BYTE ; Save byte
LDA #$08 ; reset bit counter
STA LDR_BIT_COUNTER
STA LDR_BYTE_SIGNAL ; signal byte completed
done:
PLA
TAX
PLA
RTI

; ***************************************
; SYNC reader
; ***************************************
reSync:
LDA BG_BLANK_ADDR
ORA #$10
STA BG_BLANK_ADDR

LDA #$00
STA BG_COLOR
sync:
LDA LDR_BIT_ACCUMULATOR ; Peek accumulator to sync bit stream
CMP #$01
BNE sync

LDA #$00
STA LDR_BYTE_SIGNAL
LDA #$08
STA LDR_BIT_COUNTER

midSync:
JSR waitForByte
CMP #$01
BEQ midSync

LDX #$09
countDownLoop:
TXA
CMP LDR_BYTE
BNE reSync
JSR waitForByte
DEX
BNE countDownLoop
CMP #$00
BNE reSync
RTS


; ***************************************
; Hook $300 jump table for auto load
; ***************************************
!FILL $03, 0

; We should be at $0300 now.
; BUG: if we fill just up to $30a, the rest will be overwritten by basic stacks and ...
;      so we fill with known values up to and including $0333 so the jump table
;      stays sane

;$0300
!byte $8b, $e3, <start, >start, $7c, $a5, $1a ,$a7, <start, >start,  $86, $ae, $00, $00, $00, $00
;$0310
!byte $4c, $48, $b2, $00, $31, $ea, $66, $fe, $47, $fe, $4a, $f3, $91, $f2, $0e, $f2
;$320
!byte $50, $f2, $33, $f3, $57, $f1, $ca, $f1, $ed, $f6, $3e, $f1, $2f, $f3, $66, $fe
;$330
!byte $a5, $f4, $ed, $f5
