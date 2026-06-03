import { Reader, ReaderOptions } from './reader.js';
import { T64Reader } from '../readers/t64.js';
import { PRGReader } from '../readers/prg.js';
import { D64Reader } from '../readers/d64.js';
import { TAPReader } from '../readers/tap.js';
import { WAVReader } from '../readers/wav.js';
import { ImageReader } from '../readers/image.js';

export class ReaderFactory {
    static getReader(filePath: string, options: ReaderOptions): Reader {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 't64':
                return new T64Reader(filePath, options);
            case 'prg':
            case 'p00':
                return new PRGReader(filePath, options);
            case 'd64':
                return new D64Reader(filePath, options);
            case 'tap':
                return new TAPReader(filePath, options);
            case 'wav':
                return new WAVReader(filePath, options);
            case 'jpg':
            case 'jpeg':
            case 'png':
                return new ImageReader(filePath, options);
            default:
                throw new Error(`Unsupported file format: .${ext}`);
        }
    }
}
