import { Reader } from './reader.js';
import { T64Reader } from '../readers/t64.js';
import { PRGReader } from '../readers/prg.js';
import { D64Reader } from '../readers/d64.js';
import { TAPReader } from '../readers/tap.js';
import { WAVReader } from '../readers/wav.js';
import { ImageReader } from '../readers/image.js';

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
            case 'tap':
                return new TAPReader(filePath);
            case 'wav':
                return new WAVReader(filePath);
            case 'jpg':
            case 'jpeg':
            case 'png':
                return new ImageReader(filePath);
            default:
                throw new Error(`Unsupported file format: .${ext}`);
        }
    }
}
