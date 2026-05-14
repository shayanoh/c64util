import { C64FileInfo } from '../types/index.js';
import {
    TapePulseGenerator,
    TapePulseGeneratorOptions
} from './tapePulseGenerator.js';

const CBM_FILE_TYPE_CODES: Record<string, number> = {
    PRG: 0x03,
    SEQ: 0x02,
    USR: 0x04,
    REL: 0x05,
    DEL: 0x00
};

const PULSE_SHORT = 48 * 8;
const PULSE_MEDIUM = 67 * 8;
const PULSE_LONG = 85 * 8;

export class TapePulseGeneratorKernal extends TapePulseGenerator {
    constructor(options: TapePulseGeneratorOptions) {
        super(options);
    }

    async generatePulses(file: C64FileInfo, hdrCode?: Buffer): Promise<void> {
        const dataLen = file.data.length;

        this.generatePilot('Header');
        this.generateHeaderBlock(
            file.name,
            file.type,
            file.startAddr,
            file.endAddr,
            false,
            hdrCode
        );
        this.generatePilot('Short');
        this.generateHeaderBlock(
            file.name,
            file.type,
            file.startAddr,
            file.endAddr,
            true,
            hdrCode
        );

        this.sendPause('Header');

        this.generatePilot('Data');

        const totalCopies = 2;

        this.startProgress(file.data.length * totalCopies);

        for (let block = 0; block < totalCopies; block++) {
            const isSecondBlock = block === 1;
            if (isSecondBlock) {
                this.generatePilot('Short');
            }

            this.generateBlockCountdown(isSecondBlock);
            var checksum = 0;
            for (let j = 0; j < dataLen; j++) {
                checksum ^= file.data[j];
                this.generateEncodedByte(file.data[j]);
                this.updateProgress(j, dataLen);
            }
            this.generateEncodedByte(checksum);
            this.generateEndOfBlock();
        }

        this.updateProgress(dataLen, dataLen);
        this.finishProgress();
    }

    protected sendShortPulse() {
        this.sendCustomPulse(PULSE_SHORT);
    }
    protected sendMediumPulse() {
        this.sendCustomPulse(PULSE_MEDIUM);
    }
    protected sendLongPulse() {
        this.sendCustomPulse(PULSE_LONG);
    }

    protected generateEncodedByte(byte: number): void {
        if (byte < 0 || byte > 255) {
            throw new Error('Invalid byte value: ' + byte);
        }

        this.generateNewDataMarker();
        var parity = 0;
        for (let i = 0; i < 8; i++) {
            if (byte & (1 << i)) {
                parity++;
                this.sendMediumPulse();
                this.sendShortPulse();
            } else {
                this.sendShortPulse();
                this.sendMediumPulse();
            }
        }

        // Odd parity: Number of ones + parity should be odd
        if (parity % 2 == 0) {
            this.sendMediumPulse();
            this.sendShortPulse();
        } else {
            this.sendShortPulse();
            this.sendMediumPulse();
        }
    }

    protected generateNewDataMarker(): void {
        this.sendLongPulse();
        this.sendMediumPulse();
    }
    protected generateEndOfBlock(): void {
        this.sendLongPulse();
        this.sendShortPulse();
    }

    protected generateBlockCountdown(isRepeat: boolean): void {
        let sync: number[];
        if (isRepeat) {
            sync = [0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01];
        } else {
            sync = [0x89, 0x88, 0x87, 0x86, 0x85, 0x84, 0x83, 0x82, 0x81];
        }
        for (let i = 0; i < sync.length; i++) {
            this.generateEncodedByte(sync[i]);
        }
    }

    protected generateHeaderBlock(
        filename: string,
        fileType: string,
        startAddr: number,
        endAddr: number,
        isRepeat: boolean,
        hdrCode: Buffer | undefined = undefined
    ): void {
        if (hdrCode && hdrCode.length > 192 - 21) {
            throw new Error(
                'Given header code is too large to fit in tape header'
            );
        }
        const typeByte = CBM_FILE_TYPE_CODES[fileType] || 0x03;
        const filenameBytes = filename
            .padEnd(16, '\x20')
            .slice(0, 16)
            .split('')
            .map((c) => c.charCodeAt(0));
        const headerData = [
            typeByte,
            startAddr & 0xff,
            startAddr >> 8,
            endAddr & 0xff,
            endAddr >> 8,
            ...filenameBytes
        ];
        this.generateBlockCountdown(isRepeat);
        var checksum = 0;
        for (let i = 0; i < 192; i++) {
            var byteVal = i < headerData.length ? headerData[i] : 0x20;
            if (hdrCode) {
                // buffer starts at 0x33c
                // hdrcode should be at 0x351
                // that's 21 byte offset from header
                const hdrCodeOffsetStart = 21;
                if (
                    i >= hdrCodeOffsetStart &&
                    i - hdrCodeOffsetStart < hdrCode.length
                ) {
                    byteVal = hdrCode[i - hdrCodeOffsetStart];
                }
            }
            checksum ^= byteVal;
            this.generateEncodedByte(byteVal);
        }
        this.generateEncodedByte(checksum);
        this.generateEndOfBlock();
    }
    protected generatePilot(
        length: 'Header' | 'Data' | 'Short' | number
    ): void {
        var count = 0;
        if (typeof length === 'number') {
            count = length;
        } else {
            switch (length) {
                case 'Header':
                    count = 5000;
                    break;
                case 'Data':
                    count = 500;
                    break;
                case 'Short':
                    count = 60;
                    break;
                default:
                    throw new Error('Invalid pilot length specified');
            }
        }
        for (let i = 0; i < count; i++) {
            this.sendShortPulse();
        }
    }
}
