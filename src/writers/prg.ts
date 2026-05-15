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

        var header = Buffer.alloc(2);
        header.writeUInt16LE(files[0].startAddr);

        this.write(header);
        this.write(files[0].data);
    }
}
