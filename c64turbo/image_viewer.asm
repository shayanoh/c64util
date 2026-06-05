* = $0801
.word basend
.word 0
.byte $9e
.byte <(((start / 1000) % 10) + $30)
.byte <(((start / 100) % 10) + $30)
.byte <(((start / 10) % 10) + $30)
.byte <(((start / 1) % 10) + $30)
.byte 0
basend:
.word 0

color = $d800
borColor = $d020
bkgColor = $d021
vicMemoryPointers = $d018 ; 0001 1110 [0010] 1*1k = screen - [111x] * 15*1k = bitmap/character
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

* = $0820

memcpy .macro src, srcEnd, dst
        ldy #$00
        lda #<\src
        sta memcpySrcLo
        lda #>\src
        sta memcpySrcHi

        lda #<\srcEnd
        sta memcpySrcEndLo
        lda #>\srcEnd
        sta memcpySrcEndHi

        lda #<\dst
        sta memcpyDstLo
        lda #>\dst
        sta memcpyDstHi

        jsr memcpySlow
.endm


start:
        sei

        lda #%00000101
        sta $01

        lda #$7f
        sta $dc0d
        lda $dc0d ; ack irq

;Install IRQ handler
        lda #<irq_handler
        sta $fffe
        lda #>irq_handler
        sta $ffff

        cli

; set bitmap mode

        lda cia2PRA
        and #%11111100
        ora #%00000001     ;<- your desired VIC bank value, see above
        sta cia2PRA

     ;x01xxxxx : ecm=0 bmm=1
        lda vicControl1
        and #%10011111
        ora #%00100000
        sta vicControl1

     ;xxx1xxxx : mcm = 1
        lda vicControl2
        and #%11101111
        ora #%00010000
        sta vicControl2

        lda #%00011110
        sta vicMemoryPointers

        lda #0
        sta borColor

; prepare bitmaps
        #memcpy image1Bitmap, image1BitmapEnd, bitmap0
        #memcpy image2Bitmap, image2BitmapEnd, bitmap1
; prepare screens
        #memcpy image1Screen, image1ScreenEnd, screen0
        #memcpy image2Screen, image2ScreenEnd, screen1
; temp color
        #memcpy image1Color, image1ColorEnd, color

        lda image1Bg
        sta bkgColor

        lda hasImage2
        bne imageLoop
die:
        jmp die

colorTransfer .macro colorSrc, offset
        lda #<(\colorSrc + \offset)
        sta memcpySrcLo
        lda #>(\colorSrc + \offset)
        sta memcpySrcHi
        lda #<(color + \offset)
        sta memcpyDstLo
        lda #>(color + \offset)
        sta memcpyDstHi

        ldx #$ff
        lda (memcpySrcLo, x)
        sta (memcpyDstLo, x)
-
        dex
        lda (memcpySrcLo, x)
        sta (memcpyDstLo, x)
        bne -
.endm

imageLoop:

        jsr waitForScanLine

        lda cia2PRA
        and #%11111100
        ora #%00000001      ;<- your desired VIC bank value, see above
        sta cia2PRA

        #colorTransfer image1Color, 0
        #colorTransfer image1Color, 256
        #colorTransfer image1Color, 512
        #colorTransfer image1Color, 768
        lda image1Bg
        sta bkgColor


        jsr waitForScanLine

        lda cia2PRA
        and #%11111100
        ora #%00000000      ;<- your desired VIC bank value, see above
        sta cia2PRA
        #colorTransfer image2Color, 0
        #colorTransfer image2Color, 256
        #colorTransfer image2Color, 512
        #colorTransfer image2Color, 768
        lda image2Bg
        sta bkgColor


        jmp imageLoop

waitForScanLine:
-
        lda vicControl1
        and #%10000000
        beq -
        lda vicRaster
        cmp #1
        bne -
        rts

memcpySlow:
        ldy #$00
memcpyLoop:
        lda (memcpySrcLo), y
        sta (memcpyDstLo), y

        inc memcpyDstLo
        bne +
        inc memcpyDstHi
+

        inc memcpySrcLo
        bne +
        inc memcpySrcHi
+

        lda memcpySrcLo
        cmp memcpySrcEndLo
        bne memcpyLoop
        lda memcpySrcHi
        cmp memcpySrcEndHi
        bne memcpyLoop

        rts

irq_handler:
        pha
        txa
        pha

        lda $d019          ; Load current VIC interrupt flags
        sta $d019
        lda $dc0d          ; Read and Acknowledge CIA #1 interrupts
        lda $dd0d          ; Read and Acknowledge CIA #2 interrupts

        pla
        tax
        pla
        rti


market:
        .byte 1, 2, 3, 4, 5

image1Bitmap:
        .fill 8000, 0
image1BitmapEnd:

image1Screen:
        .fill 1000, 0
image1ScreenEnd:

image1Color:
        .fill 1000, 0
image1ColorEnd:

image1Bg:
        .byte 0

hasImage2:
        .byte 0

image2Bitmap:
        .fill 8000, 0
image2BitmapEnd:

image2Screen:
        .fill 1000, 0
image2ScreenEnd:

image2Color:
        .fill 1000, 0
image2ColorEnd:

image2Bg:
        .byte 0
