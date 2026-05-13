import { Writer } from './writer.js';
import { PrgWriter } from '../writers/prg.js';
import { WavWriter } from '../writers/wav.js';
import { T64Writer } from '../writers/t64.js';
import { WriterOptions } from '../base/writer.js'
import { TapWriter } from '../writers/tap.js';

export class WriterFactory {
    static getWriter(filePath: string, options: WriterOptions): Writer {
        const ext = filePath.split('.').pop()?.toLowerCase();
        switch (ext) {
            case 'wav':
                return new WavWriter(filePath, options);
            case 'prg':
                return new PrgWriter(filePath, options);
            case 't64':
                return new T64Writer(filePath, options);
            case 'tap':
                return new TapWriter(filePath, options);
            default:
                throw new Error(`Unsupported output file format: .${ext}`);
        }
    }
}