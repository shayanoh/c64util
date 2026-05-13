import { Reader } from '../base/reader.js';
import { readFile } from 'fs/promises';
import { C64FileInfo, C64Info, CbmFileType } from '../types/index.js';

export const CBM_FILE_TYPES: Record<number, CbmFileType> = {
  0x80: 'DEL',
  0x81: 'SEQ',
  0x82: 'PRG',
  0x83: 'USR',
  0x84: 'REL'
};

export function CbmFileTypeFromValue(value: number): CbmFileType {
  return CBM_FILE_TYPES[value] ?? 'UNK';
}

export function CbmFileTypeToValue(fileType: string): number {
  for (let key in CBM_FILE_TYPES) {
    if (CBM_FILE_TYPES[key] == fileType)
      return Number.parseInt(key);
  }
  return 0;
}
export class T64Reader extends Reader {
  private version: number = 0;
  private description: string = '';
  private maxEntries: number = 0;
  private usedEntries: number = 0;

  constructor(filePath: string) {
    super(filePath);
  }

  async read(): Promise<C64Info> {
    const buffer = await readFile(this.getFilePath());
    if (buffer.length < 64) {
      throw new Error('File too small to be a valid T64');
    }

    const signature = buffer.subarray(0, 9).toString('ascii').replace(/\0/g, '');
    const validSigs = ['C64S tape', 'C64 tape '];
    if (!validSigs.includes(signature)) {
      throw new Error(`Invalid T64 signature: "${signature}"`);
    }

    this.version = buffer.readUInt16LE(32);
    if ([0x0100, 0x0101, 0x0200].findIndex((t) => t == this.version) == -1) {
      throw new Error(`Invalid T64 version: "0x${this.version.toString(16).padStart(4, '0')}"`);
    }

    this.maxEntries = buffer.readUInt16LE(34);
    this.usedEntries = buffer.readUInt16LE(36);
    this.description = buffer.subarray(40, 64).toString('ascii').replace(/\x20+$/, '').replace(/\0/g, '');

    let files = [];
    for (let i = 0; i < this.maxEntries; i++) {
      const entryOffset = 64 + i * 32;
      const entry = this.parseEntry(buffer, entryOffset);
      if (entry) {
        entry.index = i + 1;
        files.push(entry);
      }
    }

    return this.makeInfo(files);
  }

  private parseEntry(buffer: Buffer, offset: number): C64FileInfo | null {
    const entryType = buffer[offset];
    if (entryType === 0) return null;

    const cbmType = buffer[offset + 1];
    const startAddr = buffer.readUInt16LE(offset + 2);
    const endAddr = buffer.readUInt16LE(offset + 4);
    const dataOffset = buffer.readUInt32LE(offset + 8);
    const filename = buffer.subarray(offset + 16, offset + 32).toString('ascii').replace(/\x20+$/, '');

    if (startAddr === 0 && endAddr === 0) return null;

    // We should handle this bug mentioned in VICE documentations:
    //
    // (*) In the early days of emulation, an utility called "conv64" was around, which
    // created faulty T64 files that had an end address of $c3c6 regardless of the actual
    // file size. Since these files are still around, VICE tries to detect and fix this when
    // such T64 file is attached.

    const size = endAddr - startAddr;
    const fileOffset = dataOffset;
    const data = buffer.subarray(fileOffset, fileOffset + size);

    return {
      index: 0,
      type: CbmFileTypeFromValue(cbmType),
      name: filename || 'UNTITLED',
      startAddr,
      endAddr,
      size,
      data,
    };
  }

  private makeInfo(files: C64FileInfo[]): C64Info {
    const versionStr = this.version === 0x0100 ? 'v1.0' :
      this.version === 0x0101 ? 'v1.1' :
        this.version === 0x0200 ? 'v2.0' : `v${(this.version & 0xFF)}.${(this.version >> 8) & 0xFF}`;

    return {
      type: 'T64',
      version: versionStr,
      description: this.description || 'No description',
      maxEntries: this.maxEntries,
      usedEntries: this.usedEntries,
      files: files,
      totalBytes: files.reduce((sum, f) => sum + f.size, 0)
    };
  }
}