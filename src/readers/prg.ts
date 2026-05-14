import { Reader } from '../base/reader.js';
import { readFile } from 'fs/promises';
import { C64Info } from '../types/index.js';

export class PRGReader extends Reader {
    constructor(filePath: string) {
        super(filePath);
    }

    async read(): Promise<C64Info> {
        const buffer = await readFile(this.getFilePath());
        if (buffer.length < 3) {
            throw new Error('File too small to be a valid PRG');
        }
        const ext = this.getFilePath().split('.').pop()?.toLowerCase();
        if (ext == 'p00') {
            const signature = buffer.subarray(0, 7).toString('ascii');
            if (signature != 'C64File') {
                throw new Error('Invalid signature on P00 file: ' + signature);
            }
        }

        const skip = ext == 'p00' ? 26 : 0;
        const startAddress = buffer.readUint16LE(skip + 0);
        const size = buffer.length - 2 - skip;
        const endAddress = startAddress + size;
        var name: string = 'NO NAME';
        if (ext == 'prg') {
            let tmpName = this.getFilePath().split('/').pop();
            if (tmpName) {
                name = tmpName.substring(0, tmpName.length - 4).toUpperCase();
                if (name.length > 16) name = name.substring(0, 16);
            }
        } else
            name = buffer
                .subarray(8, 26)
                .toString('ascii')
                .replace(/\x20+$/, '')
                .replace(/\0/g, '');
        return {
            type: 'PRG',
            maxEntries: 1,
            usedEntries: 1,
            description: '',
            version: '',
            totalBytes: size,
            files: [
                {
                    startAddr: startAddress,
                    endAddr: endAddress,
                    index: 1,
                    name: name,
                    size: size,
                    type: 'PRG',
                    data: buffer.subarray(2 + skip, buffer.length)
                }
            ]
        };
    }
}
