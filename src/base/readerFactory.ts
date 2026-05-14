import { Reader } from './reader.js';
import { T64Reader } from '../readers/t64.js';
import { PRGReader } from '../readers/prg.js';
import { D64Reader } from '../readers/d64.js';

export class ReaderFactory {
    static getReader(filePath: string): Reader {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 't64':
                return new T64Reader(filePath);
            case 'prg':
            case 'p00':
                return new PRGReader(filePath);
            case 'd64':
                return new D64Reader(filePath);
            default:
                throw new Error(`Unsupported file format: .${ext}`);
        }
    }
}
