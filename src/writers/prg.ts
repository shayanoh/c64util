import { Writer } from '../base/writer.js';
import { C64FileInfo } from '../types/index.js';
import { WriterOptions } from '../base/writer.js';

export class PrgWriter extends Writer {
    private totalBytesWritten: number = 0;

    constructor(filePath: string, options: WriterOptions = {}) {
        super(filePath, options);
    }

    supportsMultipleFiles(): boolean {
        return false;
    }

    async writeContent(
        files: C64FileInfo[],
        options: WriterOptions = {}
    ): Promise<void> {
        if (files.length != 1) {
            throw new Error('Only one program should be selected to write.');
        }
        const file = files[0];
        if (file.headerBytes && file.headerBytes.length > 0) {
            throw new Error('PRG files should not have header bytes.');
        }
        if (file.rawCycles && file.rawCycles.length > 0) {
            throw new Error('PRG files should not have raw cycles.');
        }
        if (!file.data || file.data.length == 0) {
            throw new Error('PRG files should have data');
        }

        var header = Buffer.alloc(2);
        header.writeUInt16LE(file.startAddr);

        this.write(header);
        this.write(file.data);
    }
}
