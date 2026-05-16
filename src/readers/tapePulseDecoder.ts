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
        const pulses: PulseClass[] = new Array(pulseCycles.length);
        const classProgressInterval = Math.max(
            1,
            Math.floor(pulseCycles.length / 50)
        );
        for (let i = 0; i < pulseCycles.length; i++) {
            if (onProgress && i % classProgressInterval === 0) {
                onProgress(i, pulseCycles.length);
            }
            pulses[i] = this.classifyPulse(pulseCycles[i]);
        }
        if (onProgress) onProgress(pulseCycles.length, pulseCycles.length);

        // Find pilot sequences to locate block boundaries
        const pilots = this.findPilots(
            pulses,
            TapePulseDecoder.MIN_PILOT_LENGTH
        );

        // Decode blocks starting after each pilot
        const blocks: { bytes: number[]; isFirstCopy: boolean }[] = [];

        for (const pilot of pilots) {
            // A block starts after the pilot ends.
            // Always decode with MAX_DATA_BLOCK_BYTES — the downstream
            // isHeaderBlock() check naturally separates headers (exactly 202
            // bytes) from data blocks (any other size) using the byte count.
            const blockStart = pilot.end;

            const block = this.tryDecodeBlockBounded(
                pulses,
                blockStart,
                TapePulseDecoder.MAX_DATA_BLOCK_BYTES
            );

            if (!block || block.bytes.length < 10) continue;

            if (
                this.isCountdown(block.bytes, TapePulseDecoder.COUNTDOWN_FIRST)
            ) {
                blocks.push({ bytes: block.bytes, isFirstCopy: true });
            } else if (
                this.isCountdown(block.bytes, TapePulseDecoder.COUNTDOWN_SECOND)
            ) {
                blocks.push({ bytes: block.bytes, isFirstCopy: false });
            }
        }

        // If no blocks found via pilots, fall back to sequential scanning
        if (blocks.length === 0) {
            const fallbackBlocks = this.scanBlocksSequentially(pulses);
            blocks.push(...fallbackBlocks);
        }

        if (blocks.length === 0) return [];

        // Separate header and data blocks (only first copies)
        const headerBlocks = blocks.filter(
            (b) => b.isFirstCopy && this.isHeaderBlock(b.bytes.length)
        );
        const dataBlocks = blocks.filter(
            (b) => b.isFirstCopy && !this.isHeaderBlock(b.bytes.length)
        );

        if (headerBlocks.length === 0) return [];

        // Parse header blocks into program metadata
        const programs: HeaderInfo[] = [];
        for (const hb of headerBlocks) {
            const contentBytes = hb.bytes.slice(
                9,
                9 + TapePulseDecoder.HEADER_CONTENT_SIZE
            );
            const parsed = this.parseHeaderBlock(contentBytes);
            if (parsed) programs.push(parsed);
        }

        // Match data blocks to programs
        const files: C64FileInfo[] = [];
        for (let i = 0; i < programs.length; i++) {
            const prog = programs[i];

            if (i < dataBlocks.length) {
                const db = dataBlocks[i];
                const dataBytes = db.bytes.slice(9, db.bytes.length - 1);
                const data = Buffer.from(dataBytes);

                const expectedSize = Math.min(prog.size, data.length);
                const trimmedData = data.subarray(0, expectedSize);

                const actualEndAddr = prog.startAddr + trimmedData.length;

                files.push({
                    index: i + 1,
                    type: prog.type,
                    name: prog.name,
                    startAddr: prog.startAddr,
                    endAddr: actualEndAddr,
                    size: trimmedData.length,
                    data: trimmedData
                });
            } else if (prog.size > 0) {
                files.push({
                    index: i + 1,
                    type: prog.type,
                    name: prog.name,
                    startAddr: prog.startAddr,
                    endAddr: prog.endAddr,
                    size: prog.size,
                    data: Buffer.alloc(0)
                });
            }
        }

        return files;
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
     * Fallback: scan blocks sequentially without pilot detection.
     * Used only when pilot-based detection finds nothing.
     */
    private scanBlocksSequentially(
        pulses: PulseClass[]
    ): { bytes: number[]; isFirstCopy: boolean }[] {
        const blocks: { bytes: number[]; isFirstCopy: boolean }[] = [];
        let searchIndex = 0;

        while (searchIndex < pulses.length) {
            const block = this.tryDecodeBlockBounded(
                pulses,
                searchIndex,
                TapePulseDecoder.MAX_DATA_BLOCK_BYTES
            );
            if (!block || block.bytes.length < 10) {
                searchIndex += 10;
                continue;
            }

            searchIndex = block.endIndex;

            if (
                this.isCountdown(block.bytes, TapePulseDecoder.COUNTDOWN_FIRST)
            ) {
                blocks.push({ bytes: block.bytes, isFirstCopy: true });
            } else if (
                this.isCountdown(block.bytes, TapePulseDecoder.COUNTDOWN_SECOND)
            ) {
                blocks.push({ bytes: block.bytes, isFirstCopy: false });
            }
        }

        return blocks;
    }

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
        if (byteStart < 0) return null;

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
                if (next < 0) break;
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

        const size = endAddr - startAddr;

        return {
            type: this.cbmTypeFromHeader(typeByte),
            name: name || 'UNTITLED',
            startAddr,
            endAddr,
            size
        };
    }

    private isHeaderBlock(totalBytes: number): boolean {
        return totalBytes === 9 + TapePulseDecoder.HEADER_CONTENT_SIZE + 1;
    }
}
