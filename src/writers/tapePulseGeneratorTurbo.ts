
import { readFile } from "fs/promises";
import { C64FileInfo } from "../types/index.js";
import { TapePulseGenerator, TapePulseGeneratorOptions } from "./tapePulseGenerator.js";
import { TapePulseGeneratorKernal } from "./tapePulseGeneratorKernal.js";
import { loaderHiResBgColor, loaderHiResBitmap, loaderHiResColor, loaderHiResScreen } from './turboGraphics.js';

//const PULSE_SHORT = 15 * 8;
//const PULSE_LONG = 41 * 8;
// 100 & 350
const PULSE_SHORT = 80;// 15 * 8;
const PULSE_LONG = 250; // 41 * 8;


export class TapePulseGeneratorTurbo extends TapePulseGenerator {

    constructor(options: TapePulseGeneratorOptions) {
        super(options);
    }

    private async getLoaderCode(): Promise<{ loaderCode: Buffer, loaderHeaderCode: Buffer }> {
        /*
        const loaderHeaderCode = Buffer.from([
            0x51, 0x03, 0x78, 0xa9, 0x05, 0x85, 0x01, 0xa9, 0x7f, 0x8d, 0x0d, 0xdc,
            0xad, 0x0d, 0xdc, 0xa9, 0xa7, 0x8d, 0xfe, 0xff, 0xa9, 0x02, 0x8d, 0xff,
            0xff, 0xa9, 0xff, 0x8d, 0x04, 0xdc, 0xa9, 0x00, 0x8d, 0x05, 0xdc, 0xa9,
            0x90, 0x8d, 0x0d, 0xdc, 0xa9, 0x19, 0x8d, 0x0e, 0xdc, 0xa9, 0x00, 0x85,
            0x02, 0xa9, 0x08, 0x85, 0x03, 0xa9, 0x00, 0x85, 0x05, 0x58, 0x20, 0xc7,
            0x02, 0x20, 0xe5, 0x03, 0xc9, 0x00, 0xf0, 0x3e, 0xc9, 0x02, 0xf0, 0x07,
            0xa9, 0x37, 0x85, 0x01, 0x4c, 0x9b, 0x03, 0x20, 0xe5, 0x03, 0x85, 0x10,
            0x20, 0xe5, 0x03, 0x85, 0x11, 0x20, 0xe5, 0x03, 0x85, 0x12, 0x20, 0xe5,
            0x03, 0x85, 0x13, 0xa0, 0x00, 0xee, 0x20, 0xd0, 0x20, 0xe5, 0x03, 0x91,
            0x10, 0xe6, 0x10, 0xd0, 0x02, 0xe6, 0x11, 0xa5, 0x10, 0xc5, 0x12, 0xd0,
            0xec, 0xa5, 0x11, 0xc5, 0x13, 0xd0, 0xe6, 0x4c, 0x8c, 0x03, 0x78, 0xa9,
            0x37, 0x85, 0x01, 0x20, 0xa3, 0xfd, 0x20, 0x15, 0xfd, 0x20, 0x53, 0xe4,
            0xa2, 0x80, 0x58, 0x6c, 0x00, 0x03, 0xa5, 0x05, 0xf0, 0xfc, 0xa9, 0x00,
            0x85, 0x05, 0xa5, 0x04, 0x60
        ]);
        const loaderCode = Buffer.from([
            0xa7, 0x02, 0x48, 0x8a, 0x48, 0xad, 0x0d, 0xdc, 0xa2, 0x19, 0x8e, 0x0e,
            0xdc, 0x4a, 0x66, 0x02, 0xc6, 0x03, 0xd0, 0x0a, 0xa5, 0x02, 0x85, 0x04,
            0xa9, 0x08, 0x85, 0x03, 0x85, 0x05, 0x68, 0xaa, 0x68, 0x40, 0xa9, 0x00,
            0x8d, 0x20, 0xd0, 0xa5, 0x02, 0xc9, 0x01, 0xd0, 0xfa, 0xa9, 0x00, 0x85,
            0x05, 0xa9, 0x08, 0x85, 0x03, 0x20, 0xe5, 0x03, 0xc9, 0x01, 0xf0, 0xf9,
            0xa2, 0x09, 0x8a, 0xc5, 0x04, 0xd0, 0xdf, 0x20, 0xe5, 0x03, 0xca, 0xd0,
            0xf5, 0xc9, 0x00, 0xd0, 0xd5, 0x60, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
            0x00, 0x00, 0x00, 0x00, 0x00,
            0x8b, 0xe3, 0x51, 0x03, 0x7c, 0xa5, 0x1a,
            0xa7, 0x51, 0x03
        ]);
        */
        const loaderHeaderCode = await readFile('c64turbo/loader_header.prg');
        const loaderCode = await readFile('c64turbo/loader.prg');

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
        this.generateTurboGraphics();

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

    private generateTurboGraphics() {
        this.generateTurboBuffer(0xd800, 0xd800 + 1000, Buffer.from(loaderHiResColor));
        this.generateTurboPoke(0xd021, loaderHiResBgColor);
        this.generateTurboPoke(0xdd00, 0);
        this.generateTurboPoke(0xd018, 0x2e); // 0011 1110 [0010] 2*1k = screen - [111x] * 15*1k = bitmap
        this.generateTurboPoke(0xd011, 0x3b);
        this.generateTurboPoke(0xd016, 0x18);//
        this.generateTurboBuffer(0xc800, 0xc800 + 1000, Buffer.from(loaderHiResScreen));
        this.generateTurboBuffer(0xe000, 0xe000 + 8000, Buffer.from(loaderHiResBitmap));
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