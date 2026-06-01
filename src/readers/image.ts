import { open, writeFile } from 'fs/promises';
import { createWriteStream } from 'fs';
import { Reader } from '../base/reader.js';
import { C64Info } from '../types/index.js';
import sharp from 'sharp';

export class ImageReader extends Reader {
    constructor(filePath: string) {
        super(filePath);
    }

    readonly C64Pallete: string[] = [
        '#000000',
        '#FFFFFF',
        '#813338',
        '#75CEC8',
        '#8E3C97',
        '#56AC4D',
        '#2E2C9B',
        '#EDE171',
        '#8E5029',
        '#553800',
        '#C46C71',
        '#4A4A4A',
        '#7B7B7B',
        '#A9FF9F',
        '#706DEB',
        '#B2B2B2'
    ];

    private RGBtoHUV(
        r: number,
        g: number,
        b: number
    ): { h: number; u: number; v: number } {
        const max = Math.max(r, g, b);
        const min = Math.min(r, g, b);
        let h = 0;
        if (max === min) {
            h = 0;
        } else if (max === r) {
            h = (60 * (g - b)) / (max - min);
        } else if (max === g) {
            h = 120 + (60 * (b - r)) / (max - min);
        } else {
            h = 240 + (60 * (r - g)) / (max - min);
        }
        if (h < 0) {
            h += 360;
        }
        const u = max === 0 ? 0 : ((max - r) / max) * 255;
        const v = max === 0 ? 0 : ((max - g) / max) * 255;
        return { h, u, v };
    }
    private findClosestColor(
        red: number,
        green: number,
        blue: number,
        withinIndexes?: number[]
    ): number {
        let closestIndex = 0;
        let closestDistance = Number.MAX_VALUE;
        const { h, u, v } = this.RGBtoHUV(red, green, blue);
        const paletteIndexes =
            withinIndexes || this.C64Pallete.map((_, index) => index);
        for (let i = 0; i < paletteIndexes.length; i++) {
            const paletteColor = this.C64Pallete[paletteIndexes[i]];
            const paletteRed = parseInt(paletteColor.slice(1, 3), 16);
            const paletteGreen = parseInt(paletteColor.slice(3, 5), 16);
            const paletteBlue = parseInt(paletteColor.slice(5, 7), 16);
            const {
                h: paletteH,
                u: paletteU,
                v: paletteV
            } = this.RGBtoHUV(paletteRed, paletteGreen, paletteBlue);
            const distance = Math.sqrt(
                Math.pow(paletteH - h, 2) +
                    Math.pow(paletteU - u, 2) +
                    Math.pow(paletteV - v, 2)
            );
            if (distance < closestDistance) {
                closestDistance = distance;
                closestIndex = paletteIndexes[i];
            }
        }
        return closestIndex;
    }

    private findClosestColorIndex(
        index: number,
        withinIndexes: number[]
    ): number {
        const indexRgb = this.C64Pallete[index];
        const indexRed = parseInt(indexRgb.slice(1, 3), 16);
        const indexGreen = parseInt(indexRgb.slice(3, 5), 16);
        const indexBlue = parseInt(indexRgb.slice(5, 7), 16);
        return this.findClosestColor(
            indexRed,
            indexGreen,
            indexBlue,
            withinIndexes
        );
    }

    async read(): Promise<C64Info> {
        let image = sharp(this.getFilePath());
        let newWidth: number = 0;
        let newHeight: number = 0;
        image = await image
            .metadata()
            .then((metadata) => {
                const aspect = metadata.width / metadata.height;
                newWidth = 320;
                newHeight = Math.round(newWidth / aspect);
                if (newHeight > 200) {
                    newHeight = 200;
                    newWidth = Math.round(newHeight * aspect);
                }
                newWidth = Math.round(newWidth / 2);
                return image
                    .resize({ width: newWidth, height: newHeight, fit: 'fill' })
                    .normalise();
            })
            .catch((err) => {
                throw new Error('Error processing image:' + err);
            });
        await image.png().toFile('/Users/shayanoh/Desktop/test.png');
        console.log(
            `Resized image to ${newWidth}x${newHeight} = ${newWidth * newHeight} pixels`
        );
        const imageBuffer = await image.raw({ depth: 'uchar' }).toBuffer();
        // Convert all colors to closest C64 palette color
        console.log(`imageBuffer length: ${imageBuffer.length}`);
        const intermediateBuffer = Buffer.alloc(newWidth * newHeight, 0);
        for (let i = 0; i < imageBuffer.length; i += 3) {
            const r = imageBuffer[i];
            const g = imageBuffer[i + 1];
            const b = imageBuffer[i + 2];
            intermediateBuffer[i / 3] = this.findClosestColor(r, g, b);
        }
        // Find the most common color to be used as background color
        const colorCounts: number[] = new Array(this.C64Pallete.length).fill(0);
        intermediateBuffer.forEach((colorIndex) => {
            colorCounts[colorIndex]++;
        });
        console.log(colorCounts);
        const backgroundColorIndex = colorCounts.indexOf(
            Math.max(...colorCounts)
        );
        console.log('Background color index: ' + backgroundColorIndex);
        // Check each 8x8 block and keep only the 3 most common colors (including
        // background) in that block and generate output buffers
        const screenBuffer = Buffer.alloc(
            1000,
            backgroundColorIndex & (backgroundColorIndex << 4)
        );
        const colorRamBuffer = Buffer.alloc(1000, backgroundColorIndex);
        const bitmapBuffer = Buffer.alloc(8000, 0xff);

        let bitmapBufferIndex = 0;
        for (let y = 0; y < newHeight; y += 8) {
            for (let x = 0; x < newWidth; x += 4) {
                const blockColorCounts: number[] = new Array(
                    this.C64Pallete.length
                ).fill(0);
                for (let j = 0; j < 8; j++) {
                    for (let i = 0; i < 4; i++) {
                        const colorIndex =
                            y + j < newHeight && x + i < newWidth
                                ? intermediateBuffer[
                                      (y + j) * newWidth + (x + i)
                                  ]
                                : backgroundColorIndex;
                        blockColorCounts[colorIndex]++;
                    }
                }
                let topColors = blockColorCounts
                    .map((count, index) => ({ index, count }))
                    .sort((a, b) => b.count - a.count)
                    .filter(
                        ({ index, count: _ }) => index !== backgroundColorIndex
                    )
                    .map((c) => c.index);
                topColors = topColors.slice(0, 3);
                topColors.unshift(backgroundColorIndex);
                screenBuffer[(y / 8) * 40 + x / 4] =
                    topColors[1] & (topColors[2] << 4);
                colorRamBuffer[(y / 8) * 40 + x / 4] = topColors[3];
                for (let j = 0; j < 8; j++) {
                    let val = 0;
                    for (let i = 0; i < 4; i++) {
                        let colorIndex =
                            y + j < newHeight && x + i < newWidth
                                ? intermediateBuffer[
                                      (y + j) * newWidth + (x + i)
                                  ]
                                : backgroundColorIndex;
                        if (!topColors.includes(colorIndex)) {
                            colorIndex = this.findClosestColorIndex(
                                colorIndex,
                                topColors
                            );
                        }
                        val <<= 2;
                        val |= topColors.indexOf(colorIndex);
                    }
                    const bitmapOffset = (y / 8) * 40 * 8 + (x / 4) * 8 + j;
                    bitmapBuffer[bitmapOffset] = val;
                }
            }
        }

        const tmpFile = await open('/Users/shayanoh/Desktop/test.prg', 'w');
        const tmpFileWriter = tmpFile.createWriteStream();
        const loadAddressBuffer = Buffer.alloc(2);
        loadAddressBuffer.writeUInt16LE(0x2000, 0);
        tmpFileWriter.write(loadAddressBuffer);
        tmpFileWriter.write(bitmapBuffer);
        tmpFileWriter.write(colorRamBuffer);
        tmpFileWriter.write(screenBuffer);
        const bgColorBuffer = Buffer.alloc(1, backgroundColorIndex);
        tmpFileWriter.write(bgColorBuffer);
        tmpFileWriter.end();
        await tmpFile.close();

        process.exit(0);
        const info: C64Info = {
            type: 'PRG',
            version: '',
            description: '',
            maxEntries: 0,
            usedEntries: 0,
            files: [],
            totalBytes: 0
        };
        return info;
    }
}
