import { readFile } from 'fs/promises';
import { Reader, ReaderOptions } from '../base/reader.js';
import { C64Info } from '../types/index.js';
import { TapePulseDecoder } from './tapePulseDecoder.js';

interface WavFormatInfo {
    channels: number;
    sampleRate: number;
    bitDepth: number;
    dataOffset: number;
    dataSize: number;
}

export class WAVReader extends Reader {
    constructor(filePath: string, options: ReaderOptions = {}) {
        super(filePath, options);
    }

    async read(): Promise<C64Info> {
        const buffer = await readFile(this.getFilePath());

        const wavInfo = this.parseWavHeader(buffer);

        if (wavInfo.bitDepth !== 8 && wavInfo.bitDepth !== 16) {
            throw new Error(
                `Unsupported bit depth: ${wavInfo.bitDepth}. Only 8-bit and 16-bit PCM are supported.`
            );
        }

        const samples = buffer.subarray(
            wavInfo.dataOffset,
            wavInfo.dataOffset + wavInfo.dataSize
        );

        // ── Extract pulses from audio samples (heavy part) ──────────────

        const bytesPerFrame = (wavInfo.bitDepth / 8) * wavInfo.channels;
        const totalFrames = Math.floor(samples.length / bytesPerFrame);

        this.createProgressBar(
            totalFrames,
            '  Extracting pulses [:bar] :percent'
        );

        let lastProgress = 0;
        const pulseValues = this.extractPulsesFromWav(
            samples,
            wavInfo.channels,
            wavInfo.sampleRate,
            wavInfo.bitDepth,
            (current, _total) => {
                const delta = current - lastProgress;
                if (delta > 0) {
                    this.updateProgress(delta);
                    lastProgress = current;
                }
            }
        );

        this.finishProgress();

        if (pulseValues.length === 0) {
            throw new Error(
                'Could not extract any pulses from the WAV file. ' +
                    'The audio may not contain a C64 tape signal.'
            );
        }

        // ── Decode programs from pulses ─────────────────────────────────

        const pulseCycles = pulseValues.map((v) => v * 8);

        this.createProgressBar(
            pulseCycles.length,
            '  Decoding programs [:bar] :percent'
        );

        lastProgress = 0;
        const decoder = new TapePulseDecoder();
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
        const description = `Decoded from ${wavInfo.sampleRate}Hz ${wavInfo.bitDepth}-bit audio, ${pulseValues.length} pulses extracted`;

        return {
            type: 'WAV',
            version: `WAV ${wavInfo.bitDepth}-bit ${wavInfo.sampleRate}Hz`,
            description,
            maxEntries: files.length || 1,
            usedEntries: files.length,
            files,
            totalBytes
        };
    }

    // ── WAV-specific parsing ────────────────────────────────────────────

    /**
     * Parse a WAV file header and return format information.
     * Walks chunks in a single pass for efficiency.
     * Supports 8-bit unsigned and 16-bit signed PCM.
     */
    private parseWavHeader(buffer: Buffer): WavFormatInfo {
        if (buffer.length < 44) {
            throw new Error('File too small to be a valid WAV file');
        }

        const riff = buffer.subarray(0, 4).toString('ascii');
        if (riff !== 'RIFF') {
            throw new Error(`Invalid RIFF signature: "${riff}"`);
        }

        const wave = buffer.subarray(8, 12).toString('ascii');
        if (wave !== 'WAVE') {
            throw new Error(`Invalid WAVE signature: "${wave}"`);
        }

        let channels = 0;
        let sampleRate = 0;
        let bitDepth = 0;
        let dataOffset = 0;
        let dataSize = 0;
        let offset = 12;

        while (offset < buffer.length - 8) {
            const chunkId = buffer
                .subarray(offset, offset + 4)
                .toString('ascii');
            const chunkSize = buffer.readUInt32LE(offset + 4);

            if (chunkId === 'fmt ') {
                const audioFormat = buffer.readUInt16LE(offset + 8);
                if (audioFormat !== 1 && audioFormat !== 0xfffe) {
                    throw new Error(
                        `Unsupported audio format: ${audioFormat}. Only PCM (1) is supported.`
                    );
                }
                channels = buffer.readUInt16LE(offset + 10);
                sampleRate = buffer.readUInt32LE(offset + 12);
                bitDepth = buffer.readUInt16LE(offset + 22);
            } else if (chunkId === 'data') {
                dataOffset = offset + 8;
                dataSize = chunkSize;
            }

            offset += 8 + chunkSize;
            if (chunkSize % 2 !== 0) offset++;
        }

        if (!channels) {
            throw new Error('No fmt chunk found in WAV file');
        }
        if (!dataOffset) {
            throw new Error('No data chunk found in WAV file');
        }

        return { channels, sampleRate, bitDepth, dataOffset, dataSize };
    }

    /**
     * Check whether a sample value is HIGH (active tape pulse signal).
     * For 8-bit: HIGH is 0xFF. For 16-bit: HIGH is a large positive value.
     */
    private isHighSample(value: number, bitDepth: number): boolean {
        if (bitDepth === 8) {
            return value >= 0xf0;
        }
        return value > 20000;
    }

    /**
     * Extract pulse cycle values from WAV audio samples using typed arrays
     * for fast O(1) sample access.
     */
    private extractPulsesFromWav(
        samples: Buffer,
        channels: number,
        sampleRate: number,
        bitDepth: number,
        onProgress?: (current: number, total: number) => void
    ): number[] {
        const pulses: number[] = [];
        const bytesPerFrame = (bitDepth / 8) * channels;
        const totalFrames = Math.floor(samples.length / bytesPerFrame);

        let samples8: Uint8Array | null = null;
        let samples16: Int16Array | null = null;
        if (bitDepth === 8) {
            samples8 = new Uint8Array(
                samples.buffer,
                samples.byteOffset,
                samples.length
            );
        } else {
            samples16 = new Int16Array(
                samples.buffer,
                samples.byteOffset,
                samples.length / 2
            );
        }

        const risingEdges: number[] = [];

        // If the signal starts HIGH, treat frame 0 as an implicit rising edge
        // (the actual rising edge occurred before the WAV started recording)
        let firstSampleValue: number;
        if (bitDepth === 8) {
            firstSampleValue = samples8![0];
        } else {
            firstSampleValue = samples16![0];
        }
        if (this.isHighSample(firstSampleValue, bitDepth)) {
            risingEdges.push(0);
        }

        const progressInterval = Math.max(1, Math.floor(totalFrames / 100));
        let nextProgress = progressInterval;

        for (let frame = 1; frame < totalFrames; frame++) {
            if (onProgress && frame >= nextProgress) {
                onProgress(frame, totalFrames);
                nextProgress = frame + progressInterval;
            }

            let sample: number;
            let prevSample: number;
            if (bitDepth === 8) {
                sample = samples8![frame * channels];
                prevSample = samples8![(frame - 1) * channels];
            } else {
                sample = samples16![frame * channels];
                prevSample = samples16![(frame - 1) * channels];
            }

            if (
                this.isHighSample(sample, bitDepth) &&
                !this.isHighSample(prevSample, bitDepth)
            ) {
                risingEdges.push(frame);
            }
        }

        if (onProgress) onProgress(totalFrames, totalFrames);

        if (risingEdges.length === 0) {
            return pulses;
        }

        for (let i = 0; i < risingEdges.length; i++) {
            const currentEdge = risingEdges[i];
            let nextEdge: number;

            if (i + 1 < risingEdges.length) {
                nextEdge = risingEdges[i + 1];
            } else {
                const half = this.estimateHalfSamples(
                    samples,
                    currentEdge,
                    channels,
                    bitDepth
                );
                nextEdge = currentEdge + half * 2;
            }

            const sampleDiff = nextEdge - currentEdge;
            if (sampleDiff <= 0) continue;

            const seconds = sampleDiff / sampleRate;
            const cycles = Math.round(seconds * TapePulseDecoder.CLOCK_CYCLES);
            if (cycles <= 0) continue;

            const tapValue = Math.round(cycles / 8);
            pulses.push(tapValue);
        }

        return pulses;
    }

    /**
     * Estimate the number of half-samples for the last pulse in the stream.
     */
    private estimateHalfSamples(
        samples: Buffer,
        startFrame: number,
        channels: number,
        bitDepth: number
    ): number {
        const bytesPerFrame = (bitDepth / 8) * channels;
        let framePos = Math.round(startFrame);
        let halfSamples = 0;

        let getSample: (index: number) => number;
        if (bitDepth === 8) {
            const view = new Uint8Array(
                samples.buffer,
                samples.byteOffset,
                samples.length
            );
            getSample = (idx) => view[idx];
        } else {
            const view = new Int16Array(
                samples.buffer,
                samples.byteOffset,
                samples.length / 2
            );
            getSample = (idx) => view[idx];
        }

        while (framePos * bytesPerFrame < samples.length) {
            const val = getSample(framePos);

            if (!this.isHighSample(val, bitDepth)) break;
            halfSamples++;
            framePos++;
        }

        return halfSamples;
    }
}
