import { Writer } from '../base/writer.js';
import chalk from 'chalk';
import { C64FileInfo } from '../types/index.js';
import { open, readFile } from 'fs/promises';
import { TapePulseGenerator, TapePulseGeneratorOptions } from './tapePulseGenerator.js';
import { TapePulseGeneratorTurbo } from './tapePulseGeneratorTurbo.js';
import { TapePulseGeneratorKernal } from './tapePulseGeneratorKernal.js';
import { WriterOptions } from '../base/writer.js';
const CLOCK_CYCLES = 985248;

const PAUSE_INTRA_FILE_MS = 5000;

const BYTE_HIGH = 0xFF;
const BYTE_MID = 0x80;
const BYTE_LOW = 0x00;

export class WavWriter extends Writer {
  private sampleRate: number;
  private totalSamples: number = 0;
  private turbo: boolean = false;

  private pulseGenerator: TapePulseGenerator;
  constructor(filePath: string, options: WriterOptions = {}) {
    super(filePath);
    this.sampleRate = options.wavSampleRate || 48000;
    this.turbo = options.wavTurbo ? true : false;
    const pulseGeneratorOptions: TapePulseGeneratorOptions = {
      pulseCallback: (cycles) => this.writePulse(cycles),
      progressStartCallback: (total: number) => {
        this.createProgressBar(
          total,
          `  ${chalk.cyan('Generating audio :current / :total bytes')} [:bar] :percent`
        );

      },
      progressCallback: (current: number, total: number) => {
        this.updateProgressAbsolute(current / total);
      },
      progressFinishCallback: () => {
        this.finishProgress();
      }
    };
    if (this.turbo) {
      this.pulseGenerator = new TapePulseGeneratorTurbo(pulseGeneratorOptions);
    }
    else {
      this.pulseGenerator = new TapePulseGeneratorKernal(pulseGeneratorOptions);
    }
  }

  private writePulse(cycles: number) {
    const pulseSeconds = cycles / CLOCK_CYCLES;
    const pulseSamples = Math.round(pulseSeconds * this.sampleRate);
    const halfSamples = Math.round(pulseSamples / 2);

    const pulseBuffer = Buffer.alloc(pulseSamples, BYTE_LOW);
    // If cycles is more than 10 milliseconds, it should be considered a pause,
    // otherwise it's a legitimate signal
    if (cycles > 0.01 * CLOCK_CYCLES)
      pulseBuffer.fill(BYTE_MID, 0, pulseSamples);
    else
      pulseBuffer.fill(BYTE_HIGH, 0, halfSamples);
    this.write(pulseBuffer);
    this.totalSamples += pulseBuffer.length;
  }

  supportsMultipleFiles(): boolean {
    return true;
  }

  async writeContent(files: C64FileInfo[]): Promise<void> {

    this.write(this.generateWavHeader(0)); // Placeholder header, will be overwritten later
    this.totalSamples = 0;
    for (let i = 0; i < files.length; i++) {
      if (i > 0) {
        this.pulseGenerator.sendPause(PAUSE_INTRA_FILE_MS);
      }

      await this.pulseGenerator.generatePulses(files[i]);

    }
  }

  async close(): Promise<void> {
    await super.close();

    const buffer = this.generateWavHeader(this.totalSamples);
    const file = await open(this.filePath, 'r+');
    await file.write(buffer, 0, buffer.length, 0);
    await file.close();
  }

  private generateWavHeader(dataSize: number): Buffer {
    const header = Buffer.alloc(44);

    header.write('RIFF', 0);
    header.writeUInt32LE(36 + dataSize, 4);
    header.write('WAVE', 8);

    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20);
    header.writeUInt16LE(1, 22);
    header.writeUInt32LE(this.sampleRate, 24);
    header.writeUInt32LE(this.sampleRate, 28);
    header.writeUInt16LE(1, 32);
    header.writeUInt16LE(8, 34);

    header.write('data', 36);
    header.writeUInt32LE(dataSize, 40);

    return header;
  }

  printInfo(): void {
    const totalSamples = this.totalSamples;
    const sampleRate = this.sampleRate;
    const durationSeconds = totalSamples / sampleRate;
    const minutes = Math.floor(durationSeconds / 60);
    const seconds = Math.floor(durationSeconds % 60);
    const durationStr = minutes + ':' + seconds.toString().padStart(2, '0');

    console.log(chalk.cyan(' Audio:') + ' ' + durationStr + ' (' + this.totalSamples + ' samples)\n');
  }
}