import { createWriteStream, mkdirSync, WriteStream } from 'fs';
import { dirname } from 'path';
import Progress from 'progress';
import { C64FileInfo } from '../types/index.js';

export interface WriterOptions {
    wavSampleRate?: number;
    wavTurbo?: boolean;
}

export abstract class Writer {
    protected writeStream: WriteStream | null = null;
    protected buffer: Buffer = Buffer.alloc(0);
    protected chunkSize: number = 64 * 1024;
    protected bufferFilled: number = 0;
    protected progressBar: Progress | null = null;
    protected filePath: string;

    protected constructor(filePath: string) {
        if (this.constructor === Writer) {
            throw new Error('Writer is an abstract class');
        }
        this.chunkSize = 64 * 1024;
        this.buffer = Buffer.alloc(this.chunkSize);
        this.bufferFilled = 0;
        this.filePath = filePath;
    }

    protected createProgressBar(total: number, format: string): void {
        if (
            typeof process.stdout.isTTY !== 'boolean' ||
            !process.stdout.isTTY
        ) {
            return;
        }
        this.finishProgress();
        this.progressBar = new Progress(format, {
            total,
            width: 20,
            complete: '█',
            incomplete: '░',
            stream: process.stdout
        });
    }

    protected updateProgress(
        amount: number,
        tokens?: Record<string, string | number>
    ): void {
        if (this.progressBar) {
            this.progressBar.tick(amount, tokens);
        }
    }

    protected updateProgressAbsolute(
        ratio: number,
        tokens?: Record<string, string | number>
    ): void {
        if (this.progressBar) {
            this.progressBar.update(ratio, tokens);
        }
    }

    protected finishProgress() {
        if (this.progressBar) {
            this.progressBar.terminate();
            this.progressBar = null;
        }
    }

    async open(): Promise<void> {
        const dir = dirname(this.filePath);
        try {
            mkdirSync(dir, { recursive: true });
        } catch (e) {
            // ignore if directory already exists
        }
        this.writeStream = createWriteStream(this.filePath);
        this.bufferFilled = 0;
    }

    protected write(data: Buffer): void {
        try {
            const stream = this.getWriteStreamOrThrow();
            if (this.bufferFilled + data.length >= this.chunkSize) {
                this.flushBuffer();
            }
            if (data.length >= this.chunkSize) {
                this.flushBuffer();
                stream.write(data);
            } else {
                data.copy(this.buffer, this.bufferFilled);
                this.bufferFilled += data.length;
            }
        } catch (e) {
            const error = e as Error;
            console.error(
                'Write error:',
                error.message,
                'data type:',
                typeof data
            );
            throw e;
        }
    }

    protected writeRepeated(value: number, count: number): void {
        const chunk = Buffer.alloc(count, value);
        this.write(chunk);
    }

    protected getWriteStreamOrThrow(): WriteStream {
        if (!this.writeStream) {
            throw new Error('No file opened for writing!');
        }
        return this.writeStream;
    }

    protected flushBuffer(): void {
        const stream = this.getWriteStreamOrThrow();
        if (this.bufferFilled > 0) {
            const newBuffer: Buffer = Buffer.alloc(this.bufferFilled);
            this.buffer.copy(newBuffer, 0);
            stream.write(newBuffer);
            this.bufferFilled = 0;
        }
    }

    async close(): Promise<void> {
        this.flushBuffer();
        if (!this.writeStream) return;
        return new Promise((resolve) => {
            this.writeStream!.end(() => resolve());
        });
    }

    async writeData(
        data: C64FileInfo[],
        options: WriterOptions = {}
    ): Promise<void> {
        await this.open();
        await this.writeContent(data, options);
        await this.close();
    }

    abstract writeContent(
        data: C64FileInfo[],
        options: WriterOptions
    ): Promise<void>;

    printInfo(): void {}

    supportsMultipleFiles(): boolean {
        return false;
    }
}
