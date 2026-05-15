import { Writer } from '../base/writer.js';
import chalk from 'chalk';
import { C64FileInfo } from '../types/index.js';
import { open } from 'fs/promises';
import {
    TapePulseGenerator,
    TapePulseGeneratorOptions
} from './tapePulseGenerator.js';
import { TapePulseGeneratorTurbo } from './tapePulseGeneratorTurbo.js';
import { TapePulseGeneratorKernal } from './tapePulseGeneratorKernal.js';
import { WriterOptions } from '../base/writer.js';

const PAUSE_INTRA_FILE_MS = 5000;

export class TapWriter extends Writer {
    private totalBytes: number = 0;
    private turbo: boolean = false;

    private pulseGenerator: TapePulseGenerator;
    constructor(filePath: string, options: WriterOptions = {}) {
        super(filePath, options);
        this.turbo = options.wavTurbo ? true : false;
        const pulseGeneratorOptions: TapePulseGeneratorOptions = {
            pulseCallback: (cycles) => this.writePulse(cycles),
            progressStartCallback: (total: number) => {
                this.createProgressBar(
                    total,
                    `  ${chalk.cyan('Generating tape :current / :total bytes')} [:bar] :percent`
                );
            },
            progressCallback: (current: number, total: number) => {
                this.updateProgressAbsolute(current / total);
            },
            progressFinishCallback: () => {
                this.finishProgress();
            }
        };
        if (this.turbo) {
            this.pulseGenerator = new TapePulseGeneratorTurbo(
                pulseGeneratorOptions
            );
        } else {
            this.pulseGenerator = new TapePulseGeneratorKernal(
                pulseGeneratorOptions
            );
        }
    }

    private writePulse(cycles: number) {
        const tapValue = cycles / 8;
        if (tapValue <= 255) {
            const tapBuffer = Buffer.alloc(1, tapValue);
            this.write(tapBuffer);
            this.totalBytes += 1;
        } else {
            const tapBuffer = Buffer.alloc(4, 0);
            tapBuffer[1] = tapValue & 0xff;
            tapBuffer[2] = (tapValue >> 8) & 0xff;
            tapBuffer[3] = (tapValue >> 16) & 0xff;
            this.write(tapBuffer);
            this.totalBytes += 4;
        }
    }

    supportsMultipleFiles(): boolean {
        return true;
    }

    async writeContent(files: C64FileInfo[]): Promise<void> {
        this.write(this.generateTapHeader(0)); // Placeholder header, will be overwritten later
        this.totalBytes = 0;
        for (let i = 0; i < files.length; i++) {
            if (i > 0) {
                this.pulseGenerator.sendPause(PAUSE_INTRA_FILE_MS);
            }

            await this.pulseGenerator.generatePulses(files[i]);
        }
    }

    async close(): Promise<void> {
        await super.close();

        const buffer = this.generateTapHeader(this.totalBytes);
        const file = await open(this.filePath, 'r+');
        await file.write(buffer, 0, buffer.length, 0);
        await file.close();
    }

    private generateTapHeader(dataSize: number): Buffer {
        const header = Buffer.alloc(20, 0);
        header.write('C64-TAPE-RAW', 0, 'ascii');
        header.writeUInt8(1, 12);
        header.writeUInt32LE(dataSize, 16);
        return header;
    }
}
