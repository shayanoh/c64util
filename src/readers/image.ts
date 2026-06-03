import { open } from 'fs/promises';
import { Reader, ReaderOptions } from '../base/reader.js';
import { C64FileInfo, C64Info } from '../types/index.js';
import { C64Bitmap, C64ImageQuantizer } from './c64_image_quantizer.js';
import { basename, dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { readFile } from 'fs/promises';

export class ImageReader extends Reader {
    private extendedColor: boolean = false;
    constructor(filePath: string, options: ReaderOptions = {}) {
        super(filePath, options);
        this.extendedColor = options.imageExtended ?? false;
    }

    private bitmapToBuffers(
        bitmap: C64Bitmap,
        secondCopy?: boolean
    ): [Buffer, Buffer, Buffer, number] {
        const getCopy = (val: number, secondCopy?: boolean): number => {
            if (secondCopy) {
                return (val >> 4) & 0xf;
            } else {
                return val & 0xf;
            }
        };
        const bitmapBuffer = Buffer.alloc(8000);
        const colorRamBuffer = Buffer.alloc(1000);
        const screenBuffer = Buffer.alloc(1000);
        const backgroundColorIndex = getCopy(bitmap.background, secondCopy);

        bitmap.blocks.forEach((block, blockIndex) => {
            const blockStart = blockIndex * 8;
            screenBuffer[blockIndex] =
                (getCopy(block.colors[1], secondCopy) << 4) |
                getCopy(block.colors[2], secondCopy);
            colorRamBuffer[blockIndex] = getCopy(block.colors[3], secondCopy);
            for (let y = 0; y < 8; y++) {
                let val: number = 0;
                for (let x = 0; x < 4; x++) {
                    val <<= 2;
                    val |= block.pixels[y * 4 + x] & 0x03;
                }
                bitmapBuffer[blockStart + y] = val;
            }
        });
        return [
            bitmapBuffer,
            colorRamBuffer,
            screenBuffer,
            backgroundColorIndex
        ];
    }

    private async getViewerCode(): Promise<Buffer> {
        const scriptDir = dirname(fileURLToPath(import.meta.url));
        const assetDir = join(scriptDir, '../../assets');
        // Use in development:
        //const assetDir = join(scriptDir, '../../c64turbo');
        const viewerCode = await readFile(join(assetDir, 'image_viewer.prg'));

        return viewerCode;
    }

    async read(): Promise<C64Info> {
        const quantizer = new C64ImageQuantizer(
            this.getFilePath(),
            true,
            this.extendedColor,
            (total, message) =>
                this.createProgressBar(total, message + ' [:bar] :percent'),
            (current, total) => this.updateProgressAbsolute(current / total),
            () => this.finishProgress()
        );

        const c64bitmap = await quantizer.processImage();
        const [
            bitmapBuffer,
            colorRamBuffer,
            screenBuffer,
            backgroundColorIndex
        ] = this.bitmapToBuffers(c64bitmap, false);
        const [
            bitmapBuffer2,
            colorRamBuffer2,
            screenBuffer2,
            backgroundColorIndex2
        ] = this.bitmapToBuffers(c64bitmap, true);

        let viewerCode = await this.getViewerCode();
        const viewerDataOffset =
            5 +
            viewerCode.findIndex((_, idx) => {
                if (idx + 5 >= viewerCode.length) return false;
                for (let i = 0; i < 5; i++)
                    if (viewerCode[idx + i] != i + 1) return false;
                return true;
            });
        bitmapBuffer.copy(viewerCode, viewerDataOffset);
        screenBuffer.copy(viewerCode, viewerDataOffset + 8000);
        colorRamBuffer.copy(viewerCode, viewerDataOffset + 9000);
        viewerCode[viewerDataOffset + 10000] = backgroundColorIndex;
        viewerCode[viewerDataOffset + 10001] = this.extendedColor ? 1 : 0;
        if (this.extendedColor) {
            const viewerData2Offset = viewerDataOffset + 10002;
            bitmapBuffer2.copy(viewerCode, viewerData2Offset);
            screenBuffer2.copy(viewerCode, viewerData2Offset + 8000);
            colorRamBuffer2.copy(viewerCode, viewerData2Offset + 9000);
            viewerCode[viewerData2Offset + 10000] = backgroundColorIndex2;
        } else {
            viewerCode = viewerCode.subarray(0, viewerDataOffset + 10002);
        }

        const startAddr = viewerCode.readInt16LE(0);
        const imageName =
            basename(this.getFilePath()).slice(0, 16).toUpperCase() ?? 'IMAGE';
        const file: C64FileInfo = {
            index: 0,
            type: 'PRG',
            name: imageName,
            startAddr: startAddr,
            endAddr: startAddr + viewerCode.length - 2,
            size: viewerCode.length - 2,
            data: viewerCode.subarray(2, viewerCode.length)
        };

        const info: C64Info = {
            type: 'PRG',
            version: '',
            description: 'C64Util Image Viewer',
            maxEntries: 1,
            usedEntries: 1,
            files: [file],
            totalBytes: file.size
        };
        return info;
    }
}
