import { readFile } from 'fs/promises';
import { Reader, ReaderOptions } from '../base/reader.js';
import { C64Info } from '../types/index.js';
import { TapePulseDecoder } from './tapePulseDecoder.js';

export class TAPReader extends Reader {
    constructor(filePath: string, options: ReaderOptions = {}) {
        super(filePath, options);
    }

    async read(): Promise<C64Info> {
        const buffer = await readFile(this.getFilePath());
        if (buffer.length < 20) {
            throw new Error('File too small to be a valid TAP file');
        }

        const signature = buffer.subarray(0, 12).toString('ascii');
        if (signature !== 'C64-TAPE-RAW') {
            throw new Error(
                `Invalid TAP signature: "${signature}". Expected "C64-TAPE-RAW"`
            );
        }

        const version = buffer[12];
        const platform = buffer[13];
        const videoStd = buffer[14];
        const dataSize = buffer.readUInt32LE(16);

        const versionStr = `v${version}`;
        const platformNames: Record<number, string> = {
            0: 'C64',
            1: 'VIC-20',
            2: 'C16/Plus/4',
            3: 'PET',
            4: 'C5x0',
            5: 'C6x0/C7x0'
        };
        const platformName = platformNames[platform] ?? `Platform ${platform}`;
        const videoNames: Record<number, string> = {
            0: 'PAL',
            1: 'NTSC',
            2: 'OLD NTSC',
            3: 'PALN'
        };
        const videoName = videoNames[videoStd] ?? `Video ${videoStd}`;

        const decoder = new TapePulseDecoder();

        // ── Read pulses from TAP data ───────────────────────────────────

        this.createProgressBar(dataSize, '  Reading pulses [:bar] :percent');

        let lastProgress = 0;
        const pulseCycles = decoder.readTapPulses(buffer, (current, _total) => {
            const delta = current - lastProgress;
            if (delta > 0) {
                this.updateProgress(delta);
                lastProgress = current;
            }
        });

        this.finishProgress();

        // ── Decode programs from pulses ─────────────────────────────────

        this.createProgressBar(
            pulseCycles.length,
            '  Decoding programs [:bar] :percent'
        );

        lastProgress = 0;
        const files = decoder.decodeProgramsFromPulses(
            pulseCycles,
            (current, _total) => {
                const delta = current - lastProgress;
                if (delta > 0) {
                    this.updateProgress(delta);
                    lastProgress = current;
                }
            }
        );

        this.finishProgress();

        const totalBytes = files.reduce((sum, f) => sum + f.size, 0);

        return {
            type: 'TAP',
            version: versionStr,
            description: `${platformName} ${videoName} tape image, ${dataSize} bytes of pulse data`,
            maxEntries: files.length || 1,
            usedEntries: files.length,
            files,
            totalBytes
        };
    }
}
