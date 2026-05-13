
import { readFile } from "fs/promises";
import { C64FileInfo } from "../types/index.js";
import { TapePulseGenerator, TapePulseGeneratorOptions } from "./tapePulseGenerator.js";
import { TapePulseGeneratorKernal } from "./tapePulseGeneratorKernal.js";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const PULSE_SHORT = 80;
const PULSE_LONG = 250;


export class TapePulseGeneratorTurbo extends TapePulseGenerator {

    constructor(options: TapePulseGeneratorOptions) {
        super(options);
    }

    private async getLoaderCode(): Promise<{ loaderCode: Buffer, loaderHeaderCode: Buffer }> {
        const scriptDir = dirname(fileURLToPath(import.meta.url));
        const assetDir = join(scriptDir, '../../assets');
        // Use in development:
        // const assetDir = join(scriptDir, '../../c64turbo');
        const loaderHeaderCode = await readFile(join(assetDir, 'loader_header.prg'));
        const loaderCode = await readFile(join(assetDir, 'loader.prg'));

        // Patch average signal length in the code
        const averageSignal = Math.floor((PULSE_LONG + PULSE_SHORT) / 2);
        loaderCode[2] = averageSignal & 0xff;
        loaderCode[3] = (averageSignal >> 8) & 0xff;

        return { loaderCode, loaderHeaderCode };
    }

    async generatePulses(file: C64FileInfo, hdrCode?: Buffer): Promise<void> {
        if (hdrCode) {
            throw new Error("Turbo loader does not support code in header");
        }
        const { loaderCode, loaderHeaderCode } = await this.getLoaderCode();
        const turboLoader: C64FileInfo = {
            index: 0,
            startAddr: 0x2a7,
            endAddr: 0x2a7 + loaderCode.length - 2,
            name: file.name,
            type: "PRG",
            data: loaderCode.subarray(2, loaderCode.length),
            size: loaderCode.length
        };

        const kernal = new TapePulseGeneratorKernal({
            pulseCallback: (cycles) => this.sendCustomPulse(cycles)
        });

        await kernal.generatePulses(turboLoader, loaderHeaderCode.subarray(2, loaderHeaderCode.length));

        this.sendPause(500);

        this.generateTurboPilot();
        await this.generateTurboGraphics();

        this.startProgress(file.data.length);

        var writtenBytes = 0;
        const chunkLength = 512;
        const totalSize = file.endAddr - file.startAddr;
        while (writtenBytes < totalSize) {
            const bytesToWrite = Math.min(chunkLength, totalSize - writtenBytes);
            const newStartAddr = file.startAddr + writtenBytes;
            const newEndAddr = newStartAddr + bytesToWrite;
            this.generateTurboBuffer(newStartAddr, newEndAddr, file.data.subarray(writtenBytes, writtenBytes + bytesToWrite));
            writtenBytes += bytesToWrite;
            this.generateTurboGraphicsProgress(writtenBytes / totalSize, newEndAddr);
            this.updateProgress(writtenBytes, totalSize);
        }

        this.generateTurboGraphicsFinal();
        this.generateTurboAutorun();
        this.generateEncodedByte(0);
        this.generateEncodedByte(0);
        this.sendPause(100);

        this.updateProgress(totalSize, totalSize);
        this.finishProgress();
    }

    private sendShortPulse() { this.sendCustomPulse(PULSE_SHORT); }
    private sendLongPulse() { this.sendCustomPulse(PULSE_LONG); }

    private generateTurboPilot() {
        for (let j = 0; j < 100; j++) {
            this.generateEncodedByte(0x01);
        }
        for (let j = 9; j >= 0; j--) {
            this.generateEncodedByte(j);
        }

    }
    private generateEncodedByte(byte: number): void {
        if (byte < 0 || byte > 255) {
            throw new Error('Invalid byte value: ' + byte);
        }

        for (let i = 0; i < 8; i++) {
            if (byte & (1 << i)) {
                this.sendLongPulse();
            } else {
                this.sendShortPulse();
            }
        }
    }

    private generateTurboPoke(addr: number, value: number) {
        const pokeBuffer = Buffer.alloc(1);
        pokeBuffer[0] = value;
        this.generateTurboBuffer(addr, addr + 1, pokeBuffer);
    }

    private generateTurboAutorun() {
        const runBuffer = Buffer.alloc(40, 0x20);
        var run = 'run';
        for (var i = 0; i < run.length; i++) runBuffer[i] = run.charCodeAt(i) - 'a'.charCodeAt(0) + 1;
        const lineNumber = 2;
        const scrAddress = 0x400 + lineNumber * 40;
        this.generateTurboBuffer(scrAddress, scrAddress + runBuffer.length, runBuffer);
        this.generateTurboPoke(211, 0);
        this.generateTurboPoke(214, 0);
        this.generateTurboPoke(631, 13);
        this.generateTurboPoke(198, 1);
    }

    private async generateTurboGraphics() {
        const scriptDir = dirname(fileURLToPath(import.meta.url));
        const assetDir = join(scriptDir, '../../assets');
        // Use in development:
        // const assetDir = join(scriptDir, '../../c64turbo');
        const loaderImage = await readFile(join(assetDir, 'loading.bin')); //Bitmap, Screen, Color  
        const bitmapLen = 8000;
        const screenLen = 1000;
        const colorLen = 1000;
        const bitmapStart = 0;
        const screenStart = bitmapLen;
        const colorStart = bitmapLen + colorLen;

        const screenAddr = 0xc800;
        const bitmapAddr = 0xe000;
        const colorAddr = 0xd800;

        this.generateTurboBuffer(colorAddr, colorAddr + colorLen, loaderImage.subarray(colorStart, colorStart + colorLen));
        this.generateTurboPoke(0xd021, 0);
        this.generateTurboPoke(0xdd00, 0);
        this.generateTurboPoke(0xd018, 0x2e); // 0011 1110 [0010] 2*1k = screen - [111x] * 15*1k = bitmap
        this.generateTurboPoke(0xd011, 0x3b);
        this.generateTurboPoke(0xd016, 0x18);
        this.generateTurboBuffer(screenAddr, screenAddr + screenLen, loaderImage.subarray(screenStart, screenStart + screenLen));
        this.generateTurboBuffer(bitmapAddr, bitmapAddr + bitmapLen, loaderImage.subarray(bitmapStart, bitmapStart + bitmapLen));
    }

    private generateTurboGraphicsProgress(percent: number, loaderWrittenAddress: number) {
        const width = 36;
        const filledBars = Math.floor(percent * width);
        const colorBuf = Buffer.alloc(width, 11);
        for (var i = 0; i < filledBars; i++) colorBuf[i] = 1;

        const rowStart = 20;
        const colStart = 2;
        const baseAddress = 0xd800;
        var address = baseAddress + rowStart * 40 + colStart;
        if (loaderWrittenAddress >= address) {
            // Loader has written program data. If we write progess bar we will corrupt it
            return;
        }
        this.generateTurboBuffer(address, address + width, colorBuf);
        address = baseAddress + (rowStart + 1) * 40 + colStart;
        this.generateTurboBuffer(address, address + 36, colorBuf);
    }
    private generateTurboGraphicsFinal() {
        this.generateTurboPoke(0xd011, 0x1b);
        this.generateTurboPoke(0xd016, 0x08);
        this.generateTurboPoke(0xdd00, 3);
        this.generateTurboPoke(0xd018, 0x15);
    }
    private generateTurboBuffer(startAddr: number, endAddr: number, data: Buffer) {
        const size = endAddr - startAddr;
        if (size != data.length) {
            throw new Error(`Invalid turbo buffer. Size from address: ${size}, Buffer size: ${data.length}`);
        }
        this.generateEncodedByte(2);
        this.generateEncodedByte(startAddr & 0xff);
        this.generateEncodedByte(startAddr >> 8);
        this.generateEncodedByte(endAddr & 0xff);
        this.generateEncodedByte(endAddr >> 8);
        var checksum = 0;
        for (let i = 0; i < data.length; i++) {
            this.generateEncodedByte(data[i]);
            checksum ^= data[i];
        }
        checksum ^= 0xff;
        this.generateEncodedByte(checksum);
    }
}