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
!FILL $0b, 0
!byte $8b,$e3 ; default for c64 - must be at $300
!word start
!byte $7c, $a5
!byte $1a, $a7
!word start
