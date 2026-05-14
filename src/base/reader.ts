import { C64Info } from '../types/index.js';

export abstract class Reader {
    private readonly filePath: string;

    protected constructor(filePath: string) {
        this.filePath = filePath;
    }

    protected getFilePath(): string {
        return this.filePath;
    }

    abstract read(): Promise<C64Info>;
}
