import Progress from 'progress';
import { C64Info } from '../types/index.js';

export interface ReaderOptions {
    imageExtended?: boolean;
    imagePreview?: boolean;
}
export abstract class Reader {
    private readonly filePath: string;
    protected progressBar: Progress | null = null;

    protected constructor(filePath: string, options: ReaderOptions) {
        this.filePath = filePath;
    }

    protected getFilePath(): string {
        return this.filePath;
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
            complete: '\u2588',
            incomplete: '\u2591',
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

    protected finishProgress(): void {
        if (this.progressBar) {
            this.progressBar.terminate();
            this.progressBar = null;
        }
    }

    abstract read(): Promise<C64Info>;
}
