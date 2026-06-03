
*=$0801
!word basend
!word 0
!byte $9e
!byte <(((start / 1000) % 10) + $30)
!byte <(((start / 100) % 10) + $30)
!byte <(((start / 10) % 10) + $30)
!byte <(((start / 1) % 10) + $30)
!byte 0
basend:
!word 0

!address {
  color = $D800
  borColor = $D020
  bkgColor = $D021
  vicMemoryPointers = $D018 ; 0001 1110 [0010] 1*1k = screen - [111x] * 15*1k = bitmap/character
  vicControl1 = $d011 ;RST8 ECM BMM DEN RSEL  YSCROLL*3
  vicControl2 = $d016 ;-    -   RES MCM CSEL  XSCROLL*3
  vicRaster = $d012
  
  ;Bit 0..1: Select the position of the VIC-memory
  ;%00, 0: Bank 3: $C000-$FFFF, 49152-65535
  ;%01, 1: Bank 2: $8000-$BFFF, 32768-49151
  ;%10, 2: Bank 1: $4000-$7FFF, 16384-32767
  ;%11, 3: Bank 0: $0000-$3FFF, 0-16383 (standard)
  cia2PRA = $dd00
  
  screen0 = $8400 ; 0001xxxx - bank 2 (%01)
  screen1 = $c400 ; 0001xxxx - bank 3 (%00)
  
  bitmap0 = $a000 ; xxxx1110 - bank 2 (%01)
  bitmap1 = $e000 ; xxxx1110 - bank 3 (%00)
  
  memcpySrcLo = $61
  memcpySrcHi = $62
  memcpyDstLo = $63
  memcpyDstHi = $64
  memcpySrcEndLo = $65
  memcpySrcEndHi = $66
}

*= $820

!macro memcpy src, srcEnd, dst
LDY #$00
LDA #<src
STA memcpySrcLo
LDA #>src
STA memcpySrcHi

LDA #<srcEnd
STA memcpySrcEndLo
LDA #>srcEnd
STA memcpySrcEndHi

LDA #<dst
STA memcpyDstLo
LDA #>dst
STA memcpyDstHi

JSR memcpySlow
!end


start:
SEI

LDA #%00000101
STA $01

LDA #$7F
STA $DC0D
LDA $DC0D ; ack irq

;Install IRQ handler
LDA #<irq_handler
STA $FFFE
LDA #>irq_handler
STA $FFFF

CLI

; set bitmap mode

lda cia2PRA
and #%11111100
ora #%00000001     ;<- your desired VIC bank value, see above
sta cia2PRA

     ;x01xxxxx : ecm=0 bmm=1
LDA vicControl1
and #%10011111
ora #%00100000
STA vicControl1

     ;xxx1xxxx : mcm = 1
LDA vicControl2
AND #%11101111
ORA #%00010000
STA vicControl2

LDA #%00011110
STA vicMemoryPointers

LDA #0
STA borColor

; prepare bitmaps
+memcpy image1Bitmap, image1BitmapEnd, bitmap0
+memcpy image2Bitmap, image2BitmapEnd, bitmap1
; prepare screens
+memcpy image1Screen, image1ScreenEnd, screen0
+memcpy image2Screen, image2ScreenEnd, screen1
; temp color
+memcpy image1Color, image1ColorEnd, color

LDA hasImage2
BNE imageLoop
die:
jmp die

!macro colorTransfer start, offset
LDA #<(start+offset)
STA memcpySrcLo
LDA #>(start+offset)
STA memcpySrcHi
LDA #<(color+offset)
STA memcpyDstLo
LDA #>(color+offset)
STA memcpyDstHi

LDX #$ff
LDA (memcpySrcLo,X)
STA (memcpyDstLo,X)
-
DEX
LDA (memcpySrcLo,X)
STA (memcpyDstLo,X)
BNE -
!end

imageLoop:

JSR waitForScanLine

lda cia2PRA
and #%11111100
ora #%00000001      ;<- your desired VIC bank value, see above
sta cia2PRA

;+memcpy image1Color, image1ColorEnd, color
+colorTransfer image1Color, 0
+colorTransfer image1Color, 256
+colorTransfer image1Color, 512
+colorTransfer image1Color, 768
LDA image1Bg
STA bkgColor


JSR waitForScanLine

lda cia2PRA
and #%11111100
ora #%00000000      ;<- your desired VIC bank value, see above
sta cia2PRA
;+memcpy image2Color, image2ColorEnd, color
+colorTransfer image2Color, 0
+colorTransfer image2Color, 256
+colorTransfer image2Color, 512
+colorTransfer image2Color, 768
LDA image2Bg
STA bkgColor


jmp imageLoop

waitForScanLine:
-
LDA vicControl1
AND #%10000000
beq -
LDA vicRaster
CMP #01
BNE -
RTS

memcpySlow:
LDY #$00
@loop:
LDA (memcpySrcLo),Y
STA (memcpyDstLo),Y

INC memcpyDstLo
BNE +
INC memcpyDstHi
+

INC memcpySrcLo
BNE +
INC memcpySrcHi
+

LDA memcpySrcLo
CMP memcpySrcEndLo
BNE @loop
LDA memcpySrcHi
CMP memcpySrcEndHi
BNE @loop

RTS

irq_handler:
PHA
TXA
PHA

LDA $D019          ; Load current VIC interrupt flags
STA $D019 
LDA $DC0D          ; Read and Acknowledge CIA #1 interrupts
LDA $DD0D          ; Read and Acknowledge CIA #2 interrupts

PLA
TAX
PLA
RTI


market:
!byte 1,2,3,4,5

image1Bitmap:
!fill 8000, 0
image1BitmapEnd:

image1Screen:
!fill 1000, 0
image1ScreenEnd:

image1Color:
!fill 1000,0
image1ColorEnd:

image1Bg:
!byte 00

hasImage2:
!byte 00

image2Bitmap:
!fill 8000, 0
image2BitmapEnd:

image2Screen:
!fill 1000, 0
image2ScreenEnd:

image2Color:
!fill 1000,0
image2ColorEnd:

image2Bg:
!byte 00

