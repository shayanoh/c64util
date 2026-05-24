import { start } from 'repl';
import { C64FileInfo, CbmFileType } from '../types/index.js';

type PulseClass = 'SHORT' | 'MEDIUM' | 'LONG' | 'PAUSE';

interface DecodedByte {
    value: number;
    nextIndex: number;
}

interface DecodedBlock {
    bytes: number[];
    endIndex: number;
}

interface HeaderInfo {
    type: CbmFileType;
    name: string;
    startAddr: number;
    endAddr: number;
    size: number;
    headerBytes?: number[];
}

export class TapePulseDecoder {
    static readonly CLOCK_CYCLES = 985248;

    private static readonly THRESHOLD_SHORT_MAX = 460;
    private static readonly THRESHOLD_MEDIUM_MAX = 608;
    private static readonly THRESHOLD_PAUSE_MIN = 10000;

    private static readonly COUNTDOWN_FIRST = [
        0x89, 0x88, 0x87, 0x86, 0x85, 0x84, 0x83, 0x82, 0x81
    ];
    private static readonly COUNTDOWN_SECOND = [
        0x09, 0x08, 0x07, 0x06, 0x05, 0x04, 0x03, 0x02, 0x01
    ];

    private static readonly HEADER_CONTENT_SIZE = 192;
    private static readonly MAX_DATA_BLOCK_BYTES = 65535;
    private static readonly MIN_PILOT_LENGTH = 10;

    private static readonly CBM_TYPE_MAP: Record<number, CbmFileType> = {
        0x00: 'DEL',
        0x01: 'SEQ',
        0x02: 'SEQ',
        0x03: 'PRG',
        0x04: 'USR',
        0x05: 'REL'
    };

    // ── Public API ──────────────────────────────────────────────────────

    /**
     * Decode C64 programs from a stream of pulse cycles.
     * Uses pilot detection (runs of consecutive SHORT pulses) to locate
     * block boundaries, making it robust against small pulse discrepancies.
     */
    decodeProgramsFromPulses(
        pulseCycles: number[],
        onProgress?: (current: number, total: number) => void
    ): C64FileInfo[] {
        if (pulseCycles.length === 0) return [];

        // Classify all pulses
        const pulses: PulseClass[] = pulseCycles.map((cycle, idx) => {
            if (onProgress) onProgress(idx, pulseCycles.length);
            return this.classifyPulse(cycle);
        });
        if (onProgress) onProgress(pulseCycles.length, pulseCycles.length);

        // Find pilot sequences to locate block boundaries
        const pilots = this.findPilots(
            pulses,
            TapePulseDecoder.MIN_PILOT_LENGTH
        );

        // Decode blocks starting after each pilot
        const blocks: {
            bytes: number[];
            isFirstCopy: boolean;
            isRaw: boolean;
        }[] = [];

        let lastPulseIndex = 0;
        for (const pilot of pilots) {
            // A block starts after the pilot ends.
            // Always decode with MAX_DATA_BLOCK_BYTES — the downstream
            // isHeaderBlock() check naturally separates headers (exactly 202
            // bytes) from data blocks (any other size) using the byte count.
            const blockStart = pilot.end;
            if (pilot.start < lastPulseIndex - 2) {
                // FIXME: Up to two cycles overlap is possible due to parsing method, so we consider two bytes not overlapping
                continue;
            }

            // If there's a raw block between this pilot and last end of pulse,
            // add it as raw
            if (pilot.start - lastPulseIndex > 500) {
                blocks.push({
                    bytes: pulseCycles.slice(lastPulseIndex, pilot.start),
                    isFirstCopy: false,
                    isRaw: true
                });
            }

            const block = this.tryDecodeBlockBounded(
                pulses,
                blockStart,
                TapePulseDecoder.MAX_DATA_BLOCK_BYTES
            );

            if (!block || block.bytes.length < 10) continue;

            lastPulseIndex = block.endIndex;
            if (
                this.isCountdown(block.bytes, TapePulseDecoder.COUNTDOWN_FIRST)
            ) {
                blocks.push({
                    bytes: block.bytes,
                    isFirstCopy: true,
                    isRaw: false
                });
            } else if (
                this.isCountdown(block.bytes, TapePulseDecoder.COUNTDOWN_SECOND)
            ) {
                blocks.push({
                    bytes: block.bytes,
                    isFirstCopy: false,
                    isRaw: false
                });
            }
        }

        // Get last raw block after all blocks if it exists
        if (pulseCycles.length - lastPulseIndex > 500) {
            blocks.push({
                bytes: pulseCycles.slice(lastPulseIndex, pulseCycles.length),
                isFirstCopy: false,
                isRaw: true
            });
        }

        if (blocks.length === 0) return [];

        // Assembble blocks into C64 files
        const files: C64FileInfo[] = [];
        let fileIdx = 1;

        for (let i = 0; i < blocks.length; i++) {
            let b = blocks[i];
            if (b.isRaw) {
                files.push({
                    index: fileIdx++,
                    type: 'RawData',
                    name: '',
                    startAddr: 0,
                    endAddr: 0,
                    size: 0,
                    rawCycles: b.bytes
                });
                continue;
            }
            if (!this.isHeaderBlock(b.bytes.length) || !b.isFirstCopy) {
                continue;
            }

            const headerBlockData = this.parseHeaderBlock(
                b.bytes.slice(9, 9 + TapePulseDecoder.HEADER_CONTENT_SIZE)
            );
            if (!headerBlockData) {
                continue;
            }

            let j = i + 1;
            if (j >= blocks.length) {
                continue;
            }
            let nextBlock = blocks[j];
            if (
                nextBlock.isRaw ||
                !this.isHeaderBlock(nextBlock.bytes.length) ||
                nextBlock.isFirstCopy
            ) {
                continue;
            }

            j++;
            if (j >= blocks.length) {
                continue;
            }
            nextBlock = blocks[j];
            if (
                nextBlock.isRaw ||
                this.isHeaderBlock(nextBlock.bytes.length) ||
                !nextBlock.isFirstCopy
            ) {
                continue;
            }
            const dataBytes = nextBlock.bytes.slice(
                9,
                nextBlock.bytes.length - 1
            );
            const data = Buffer.from(dataBytes);

            const expectedSize = Math.min(headerBlockData.size, data.length);
            const trimmedData = data.subarray(0, expectedSize);

            const actualEndAddr =
                headerBlockData.startAddr + trimmedData.length;

            files.push({
                index: fileIdx++,
                type: headerBlockData.type,
                name: headerBlockData.name,
                startAddr: headerBlockData.startAddr,
                endAddr: actualEndAddr,
                size: trimmedData.length,
                headerBytes: headerBlockData.headerBytes
                    ? Buffer.from(headerBlockData.headerBytes)
                    : undefined,
                data: trimmedData
            });

            j++;
            if (j >= blocks.length) {
                continue;
            }
            nextBlock = blocks[j];
            if (
                nextBlock.isRaw ||
                this.isHeaderBlock(nextBlock.bytes.length) ||
                nextBlock.isFirstCopy
            ) {
                i = j - 1;
            } else {
                i = j;
            }
        }
        return this.mergeTurboData(files);
    }

    /**
     * Merge consecutive header+data pairs into single files if they match the Turbo Tape format
     */
    private mergeTurboData(files: C64FileInfo[]): C64FileInfo[] {
        const mergedFiles: C64FileInfo[] = [];
        let i = 0;
        while (i < files.length) {
            const f = files[i];
            if (f.type !== 'PRG' || !f.headerBytes || i + 1 >= files.length) {
                mergedFiles.push(f);
                i++;
                continue;
            }

            // It's possible a turbo loader. If next file is Raw, merge it in.
            const next = files[i + 1];
            if (next.type !== 'RawData') {
                mergedFiles.push(f);
                i++;
                continue;
            }

            // Merge header+data with raw pulses into a single file
            mergedFiles.push({ ...f, rawCycles: next.rawCycles });
            i += 2;
        }
        return mergedFiles;
    }

    /**
     * Extract pulse cycles from a TAP buffer. Handles V0 and V1 formats.
     */
    readTapPulses(
        buffer: Buffer,
        onProgress?: (current: number, total: number) => void
    ): number[] {
        const dataSize = buffer.readUInt32LE(16);
        const version = buffer[12];
        const pulses: number[] = [];
        let offset = 20;
        const end = 20 + dataSize;

        const totalBytes = end - offset;
        const progressInterval = Math.max(1, Math.floor(totalBytes / 100));
        let nextProgress = progressInterval;
        let bytesRead = 0;

        while (offset < end && offset < buffer.length) {
            if (onProgress && bytesRead >= nextProgress) {
                onProgress(bytesRead, totalBytes);
                nextProgress = bytesRead + progressInterval;
            }

            const byte = buffer[offset];
            offset++;
            bytesRead++;

            let pulseCycles: number;

            if (byte === 0 && version >= 1) {
                if (offset + 3 > buffer.length) break;
                const extended =
                    buffer[offset] |
                    (buffer[offset + 1] << 8) |
                    (buffer[offset + 2] << 16);
                offset += 3;
                bytesRead += 3;
                pulseCycles = extended * 8;
            } else if (byte === 0) {
                pulseCycles = 255 * 8;
            } else {
                pulseCycles = byte * 8;
            }

            pulses.push(pulseCycles);
        }

        if (onProgress) onProgress(totalBytes, totalBytes);

        return pulses;
    }

    // ── Pilot detection ─────────────────────────────────────────────────

    /**
     * Find pilot sequences: runs of consecutive SHORT pulses.
     * These signal the start of a data block in C64 tape format.
     */
    private findPilots(
        pulses: PulseClass[],
        minLength: number
    ): Array<{ start: number; end: number }> {
        const pilots: Array<{ start: number; end: number }> = [];
        let i = 0;

        while (i < pulses.length) {
            if (pulses[i] === 'SHORT') {
                const start = i;
                while (i < pulses.length && pulses[i] === 'SHORT') i++;
                const length = i - start;
                if (length >= minLength) {
                    pilots.push({ start, end: i });
                }
            } else {
                i++;
            }
        }

        return pilots;
    }

    // ── Block decoding ──────────────────────────────────────────────────

    /**
     * Try to decode a block of bytes starting from the given index.
     * Stops after maxBytes have been decoded, or when EOB is found.
     */
    private tryDecodeBlockBounded(
        pulses: PulseClass[],
        startIndex: number,
        maxBytes: number
    ): DecodedBlock | null {
        const byteStart = this.findNextByteStart(pulses, startIndex);
        if (byteStart < 0 || byteStart - startIndex > 10) return null;

        const bytes: number[] = [];
        let i = byteStart;

        while (i < pulses.length && bytes.length < maxBytes) {
            if (this.isEndOfBlock(pulses, i)) {
                i += 2;
                break;
            }

            const result = this.tryDecodeByte(pulses, i);
            if (result === null) {
                const next = this.findNextByteStart(pulses, i + 1);
                if (next < 0 || next - i > 10) break;
                i = next;
                continue;
            }

            bytes.push(result.value);
            i = result.nextIndex;
        }

        if (bytes.length === 0) return null;
        return { bytes, endIndex: i };
    }

    // ── Private helpers ─────────────────────────────────────────────────

    private classifyPulse(cycles: number): PulseClass {
        if (cycles <= 0) return 'PAUSE';
        if (cycles <= TapePulseDecoder.THRESHOLD_SHORT_MAX) return 'SHORT';
        if (cycles <= TapePulseDecoder.THRESHOLD_MEDIUM_MAX) return 'MEDIUM';
        if (cycles <= TapePulseDecoder.THRESHOLD_PAUSE_MIN) return 'LONG';
        return 'PAUSE';
    }

    private tryDecodeByte(
        pulses: PulseClass[],
        startIndex: number
    ): DecodedByte | null {
        if (
            startIndex + 1 >= pulses.length ||
            pulses[startIndex] !== 'LONG' ||
            pulses[startIndex + 1] !== 'MEDIUM'
        ) {
            return null;
        }

        let i = startIndex + 2;

        if (i + 17 >= pulses.length) return null;

        let byte = 0;

        for (let bit = 0; bit < 8; bit++) {
            if (pulses[i] === 'MEDIUM' && pulses[i + 1] === 'SHORT') {
                byte |= 1 << bit;
            } else if (!(pulses[i] === 'SHORT' && pulses[i + 1] === 'MEDIUM')) {
                return null;
            }
            i += 2;
        }

        if (
            !(pulses[i] === 'MEDIUM' && pulses[i + 1] === 'SHORT') &&
            !(pulses[i] === 'SHORT' && pulses[i + 1] === 'MEDIUM')
        ) {
            return null;
        }
        i += 2;

        return { value: byte, nextIndex: i };
    }

    private findNextByteStart(
        pulses: PulseClass[],
        startIndex: number
    ): number {
        for (let i = startIndex; i < pulses.length - 1; i++) {
            if (pulses[i] === 'LONG' && pulses[i + 1] === 'MEDIUM') {
                return i;
            }
        }
        return -1;
    }

    private isEndOfBlock(pulses: PulseClass[], index: number): boolean {
        return (
            index + 1 < pulses.length &&
            pulses[index] === 'LONG' &&
            pulses[index + 1] === 'SHORT'
        );
    }

    private isCountdown(bytes: number[], pattern: number[]): boolean {
        if (bytes.length < 9) return false;
        for (let i = 0; i < 9; i++) {
            if (bytes[i] !== pattern[i]) return false;
        }
        return true;
    }

    private cbmTypeFromHeader(typeByte: number): CbmFileType {
        return TapePulseDecoder.CBM_TYPE_MAP[typeByte] ?? 'UNK';
    }

    private parseHeaderBlock(contentBytes: number[]): HeaderInfo | null {
        if (contentBytes.length < 21) return null;

        const typeByte = contentBytes[0];
        const startAddr = contentBytes[1] | (contentBytes[2] << 8);
        const endAddr = contentBytes[3] | (contentBytes[4] << 8);
        const nameBytes = contentBytes.slice(5, 21);
        const name = String.fromCharCode(...nameBytes).replace(
            /[\x20\x00]+$/,
            ''
        );
        const headerBytes = contentBytes.slice(21, contentBytes.length);
        const countNon20 = headerBytes.reduce(
            (count, b) => count + (b !== 0x20 ? 1 : 0),
            0
        );
        const size = endAddr - startAddr;

        return {
            type: this.cbmTypeFromHeader(typeByte),
            name: name || 'UNTITLED',
            startAddr,
            endAddr,
            size,
            headerBytes: countNon20 != 0 ? headerBytes : undefined
        };
    }

    private isHeaderBlock(totalBytes: number): boolean {
        return totalBytes === 9 + TapePulseDecoder.HEADER_CONTENT_SIZE + 1;
    }
}
