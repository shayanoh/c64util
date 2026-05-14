import { readFile } from 'fs/promises';
import { Reader } from '../base/reader.js';
import { C64FileInfo, C64Info, CbmFileType } from '../types/index.js';

const SECTORS_PER_TRACK: Array<number> = [
    0, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 21, 19,
    19, 19, 19, 19, 19, 19, 18, 18, 18, 18, 18, 18, 17, 17, 17, 17, 17
];

export class D64Reader extends Reader {
    private fileBuffer?: Buffer = undefined;
    constructor(filePath: string) {
        super(filePath);
    }

    private async readFile(): Promise<void> {
        this.fileBuffer = await readFile(this.getFilePath());
    }

    private getSector(track: number, sector: number): Buffer {
        if (!this.fileBuffer) {
            throw new Error('File buffer is not loaded');
        }
        const sectorsBeforeTrack = SECTORS_PER_TRACK.slice(0, track).reduce(
            (acc, sectors) => acc + sectors,
            0
        );
        const offset = sectorsBeforeTrack * 256 + sector * 256;
        if (offset + 256 > this.fileBuffer.length) {
            throw new Error('Sector offset exceeds file buffer length');
        }
        return this.fileBuffer.subarray(offset, offset + 256);
    }

    async read(): Promise<C64Info> {
        await this.readFile();

        var c64Info: C64Info = {
            type: 'D64',
            version: '',
            description: 'D64 disk image',
            maxEntries: 0,
            usedEntries: 0,
            files: [],
            totalBytes: 0
        };

        var bamSector = this.getSector(18, 0);
        const dosType = bamSector[2];
        if (dosType !== 0x41 && dosType !== 0x42) {
            throw new Error(
                `Unexpected DOS type: ${dosType.toString(16)}. Expected 0x41 or 0x42 for D64 format.`
            );
        }
        const diskName = bamSector
            .subarray(144, 144 + 16)
            .toString('ascii')
            .replace(/\s+$/, '')
            .replace(/\xa0/g, '');
        c64Info.description = diskName;
        var dirSector = this.getSector(18, 1);
        while (true) {
            var fileIndex = 1;
            for (var i = 0; i < 256; i += 32) {
                const dirEntry = dirSector.subarray(i, i + 32);
                const { track, sector, fileName, fileType, fileSizeSectors } =
                    this.parseDirentry(dirEntry);
                if (fileType != 'PRG') {
                    continue;
                }
                if (track == 0) {
                    continue;
                }

                var fileSector = this.getSector(track, sector);
                var fileBuffer = Buffer.alloc(fileSizeSectors * 256);
                var fileBufferOffset = 0;
                while (true) {
                    const nextTrack = fileSector[0];
                    const nextSector = fileSector[1];
                    if (nextTrack === 0 || nextTrack === 0xff) {
                        fileSector.copy(
                            fileBuffer,
                            fileBufferOffset,
                            2,
                            2 + nextSector
                        );
                        fileBufferOffset += nextSector;
                        break;
                    } else {
                        fileSector.copy(fileBuffer, fileBufferOffset, 2, 256);
                        fileBufferOffset += 254;
                    }
                    fileSector = this.getSector(nextTrack, nextSector);
                }
                var shrunkFileBuffer = Buffer.alloc(fileBufferOffset - 2);
                var startAddress = fileBuffer.readUInt16LE(0);
                fileBuffer.copy(shrunkFileBuffer, 0, 2, fileBufferOffset);

                const c64FileInfo: C64FileInfo = {
                    type: fileType,
                    name: fileName,
                    index: fileIndex,
                    startAddr: startAddress,
                    endAddr: startAddress + shrunkFileBuffer.length,
                    size: fileBufferOffset,
                    data: shrunkFileBuffer
                };
                fileIndex++;

                c64Info.files.push(c64FileInfo);
            }
            const nextEntryTrack = dirSector[0];
            const nextEntrySector = dirSector[1];
            if (nextEntryTrack === 0) {
                break;
            }
            dirSector = this.getSector(nextEntryTrack, nextEntrySector);
        }
        c64Info.usedEntries = c64Info.files.length;
        c64Info.maxEntries = c64Info.files.length;
        c64Info.totalBytes = c64Info.files.reduce(
            (acc, file) => acc + file.size,
            0
        );
        return c64Info;
    }

    protected parseDirentry(dirEntry: Buffer): {
        track: number;
        sector: number;
        fileName: string;
        fileType: CbmFileType;
        fileSizeSectors: number;
    } {
        const fileTypeVal = dirEntry[2] & 0x0f;
        let fileType: CbmFileType;
        switch (fileTypeVal) {
            case 0:
                fileType = 'DEL';
                break;
            case 1:
                fileType = 'SEQ';
                break;
            case 2:
                fileType = 'PRG';
                break;
            case 3:
                fileType = 'USR';
                break;
            case 4:
                fileType = 'REL';
                break;
            default:
                fileType = 'UNK';
        }
        const track = dirEntry[3];
        const sector = dirEntry[4];

        const fileName = dirEntry
            .subarray(5, 5 + 16)
            .toString('ascii')
            .replace(/\s+$/, '')
            .replace(/\xa0/g, '');
        const fileSizeSectors = dirEntry[30] + (dirEntry[31] << 8);
        return { track, sector, fileName, fileType, fileSizeSectors };
    }
}
