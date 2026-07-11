export type CbmFileType =
    'DEL' | 'SEQ' | 'PRG' | 'USR' | 'REL' | 'UNK' | 'RawData';
export type C64FileType = 'T64' | 'PRG' | 'D64' | 'TAP' | 'WAV';
export interface C64Info {
    type: C64FileType;
    version: string;
    description: string;
    maxEntries: number;
    usedEntries: number;
    files: C64FileInfo[];
    totalBytes: number;
}

export interface C64FileInfo {
    index: number;
    type: CbmFileType;
    name: string;
    startAddr: number;
    endAddr: number;
    size: number;
    data?: Buffer;
    headerBytes?: Buffer;
    rawCycles?: number[];
}
