#!/usr/bin/env node

import { Command } from 'commander';
import chalk from 'chalk';
import { stat } from 'fs/promises';
import { Reader } from './base/reader.js';
import { C64FileInfo, C64Info } from './types/index.js';
import { Writer } from './base/writer.js';
import { ReaderFactory } from './base/readerFactory.js';
import { WriterFactory } from './base/writerFactory.js';
import { selectFile } from './player/fileSelector.js';
import { playWavBuffer } from './player/audioPlayer.js';

interface CliOptions {
    input: string;
    output: string;
    rate: string;
    files: string;
    formats: boolean;
    help: boolean;
    turbo: boolean;
    play: boolean;
}

function showFormats(): void {
    const FORMAT_INFO = [
        {
            type: 'T64 Reader',
            ext: '.t64',
            desc: 'Commodore 64 digitized tape image format'
        },
        { type: 'PRG Reader', ext: '.prg', desc: 'Commodore 64 raw program' },
        { type: 'P00 Reader', ext: '.p00', desc: 'Commodore 64 raw program' },

        {
            type: 'T64 Writer',
            ext: '.t64',
            desc: 'Commodore 64 digitized tape image format'
        },
        { type: 'WAV Writer', ext: '.wav', desc: '48kHz, 8-bit mono audio' },
        {
            type: 'TAP Writer',
            ext: '.wav',
            desc: 'Commodore 64 raw tape format'
        },
        { type: 'TXT Writer', ext: '.txt', desc: 'Pulse lengths in decimal' },
        { type: 'BIN Writer', ext: '.bin', desc: 'Raw binary (concatenated)' }
    ];

    const colWidths = [
        Math.max(...FORMAT_INFO.map((f) => f.type.length)),
        Math.max(...FORMAT_INFO.map((f) => f.ext.length)),
        Math.max(...FORMAT_INFO.map((f) => f.desc.length))
    ];

    console.log(chalk.bold.cyan('\nSupported Formats'));
    console.log(
        chalk.bold('─'.repeat(colWidths[0] + colWidths[1] + colWidths[2] + 7))
    );
    console.log(
        ' ' +
            chalk.bold('Type').padEnd(colWidths[0]) +
            '  ' +
            chalk.bold('Ext').padEnd(colWidths[1]) +
            '  ' +
            chalk.bold('Description')
    );
    console.log(
        chalk.bold('─'.repeat(colWidths[0] + colWidths[1] + colWidths[2] + 7))
    );

    FORMAT_INFO.forEach((f) => {
        console.log(
            ' ' +
                chalk.cyan(f.type).padEnd(colWidths[0]) +
                '  ' +
                chalk.yellow(f.ext).padEnd(colWidths[1]) +
                '  ' +
                chalk.white(f.desc)
        );
    });
    console.log(
        chalk.bold('─'.repeat(colWidths[0] + colWidths[1] + colWidths[2] + 7))
    );
}

const program = new Command();

program
    .name('c64util')
    .description(
        'Convert Commodore 64 game/disk/tape formats to WAV audio files'
    )
    .option('-i, --input [file]', 'Input file (required)')
    .option('-o, --output [file]', 'Output file')
    .option('-r, --rate [hz]', '', '48000')
    .option('-t, --turbo', '', false)
    .option('-f, --files [mode]', '', 'auto')
    .option(
        '-p, --play',
        'Interactive play mode: select and play programs',
        false
    )
    .option('-F, --formats', 'List supported formats')
    .option('-h, --help', 'Show this help text')
    .showHelpAfterError('Use --help to see usage.');

const options = program.parse(process.argv).opts() as CliOptions;

if (options.formats) {
    showFormats();
    process.exit(0);
}

if (!options.input || options.help) {
    console.log(
        chalk.bold.cyan('📼 C64Util - Commodore 64 Tape Utility') +
            '\n\n' +
            chalk.bold('Usage:') +
            ' c64util -i <input> [options]\n\n' +
            chalk.bold('Options:') +
            '\n' +
            '  ' +
            chalk.yellow('-i, --input [file]') +
            '   Input file (required)\n' +
            '  ' +
            chalk.yellow('-o, --output [file]') +
            '  Output file\n' +
            '  ' +
            chalk.yellow('-r, --rate [hz]') +
            '      Sample rate for WAV (default: 48000)\n' +
            '  ' +
            chalk.yellow('-t, --turbo') +
            '          Add turbo loader\n' +
            '  ' +
            chalk.yellow('-f, --files [mode]') +
            '   Files: auto (first), all, or number (default: auto)\n' +
            '  ' +
            chalk.yellow('-p, --play') +
            '           Interactive play mode: select and play programs\n' +
            '  ' +
            chalk.yellow('-F, --formats') +
            '        List supported formats\n' +
            '  ' +
            chalk.yellow('-h, --help') +
            '           Show this help text\n\n' +
            chalk.bold('Supported Formats:') +
            ' T64, PRG, P00 → T64, TAP, WAV, PRG\n\n' +
            chalk.bold('Examples:') +
            '\n' +
            chalk.yellow(' c64util -i game.t64') +
            '                      Display information about the input file\n' +
            chalk.yellow(' c64util -i game.t64 -o game.wav') +
            '          Convert all files in game.t64 to game.wav\n' +
            chalk.yellow(' c64util -i game.t64 -o game.wav -t') +
            '       Convert all files using turbo loader\n' +
            chalk.yellow(' c64util -i game.t64 -o game.wav -r 44100') +
            ' Convert all files with 44.1kHz sample rate\n' +
            chalk.yellow(' c64util -i game.t64 -o game.tap -f 1') +
            '     Convert first file to TAP format\n'
    );
    process.exit(0);
}

let reader: Reader;
try {
    reader = ReaderFactory.getReader(options.input);
} catch (err) {
    const error = err as Error;
    console.log(chalk.red('✗ Failed to create reader: ') + error.message);
    process.exit(1);
}

let info: C64Info;
try {
    info = await reader.read();
} catch (err) {
    const error = err as Error;
    console.log(chalk.red('✗ Failed to read input file: ') + error.message);
    process.exit(1);
}

function formatInfo(info: C64Info): string {
    const lines: string[] = [];

    if (info.type == 'T64') {
        lines.push(chalk.bold.cyan('📼 T64 Tape Image Information'));
        lines.push(chalk.bold('─────────────────────────────────────────────'));
        lines.push('');
        lines.push(
            chalk.bold('  Version:') + '     ' + chalk.white(info.version)
        );
        lines.push(
            chalk.bold('  Entries:') +
                '     ' +
                chalk.white(`${info.usedEntries} of ${info.maxEntries} used`)
        );
        lines.push(
            chalk.bold('  Description:') +
                ' ' +
                chalk.white(info.description || 'None')
        );
        lines.push('');
        lines.push(
            chalk.bold.cyan('─────────────────────────────────────────────')
        );
    }
    lines.push(chalk.bold('  Files found:'));
    lines.push(
        chalk.bold('  ─────────────────────────────────────────────────')
    );

    info.files.forEach((f, i) => {
        const addrRange = `$${f.startAddr.toString(16).toUpperCase().padStart(4, '0')}-$${f.endAddr.toString(16).toUpperCase().padStart(4, '0')}`;
        const line =
            '  ' +
            chalk.cyan('#' + (i + 1)) +
            '  ' +
            chalk.yellow(f.type.padEnd(4)) +
            '  ' +
            chalk.green('"' + f.name + '"').padEnd(18) +
            '  ' +
            chalk.white(addrRange) +
            '  ' +
            chalk.gray('(' + f.size + ' bytes)');
        lines.push(line);
    });

    lines.push('');
    lines.push(chalk.bold('─────────────────────────────────────────────'));
    lines.push(
        chalk.bold('  Total:') +
            ' ' +
            chalk.white(
                `${info.totalBytes} bytes across ${info.files.length} file(s)`
            )
    );

    return lines.join('\n');
}

console.log(formatInfo(info));

if (info.files.length == 0) {
    console.log(
        '\n' + chalk.yellow('! No programs found in input file, quitting.')
    );
    process.exit(1);
}

if (options.play) {
    if (options.output) {
        console.log(
            chalk.red('✗ Error: ') +
                '-p/--play and -o/--output are mutually exclusive'
        );
        process.exit(1);
    }
    if (options.files !== 'auto') {
        console.log(
            chalk.red('✗ Error: ') +
                '-p/--play and -f/--files are mutually exclusive'
        );
        process.exit(1);
    }

    while (true) {
        const selected = await selectFile(info.files, info.type);
        if (!selected) {
            console.log('\n' + chalk.cyan('ℹ Exiting play mode.'));
            process.exit(0);
        }

        const writer = WriterFactory.getBufferWriter({
            wavSampleRate: parseInt(options.rate),
            wavTurbo: selected.turbo
        });

        try {
            await writer.writeData([selected.file]);
            await writer.close();
        } catch (err) {
            const error = err as Error;
            console.log(
                '\n' + chalk.red('✗ Failed to convert: ') + error.message
            );
            continue;
        }

        const wavBuffer = writer.getOutputBuffer();
        const title = `"${selected.file.name}" (${selected.file.type})`;

        try {
            await playWavBuffer(wavBuffer, parseInt(options.rate), title);
        } catch (err) {
            const error = err as Error;
            console.log(
                '\n' + chalk.red('✗ Failed to play audio: ') + error.message
            );
        }
    }
}

if (!options.output) {
    console.log('\n' + chalk.cyan('ℹ No output file specified, quitting.'));
    process.exit(0);
}

let writer: Writer;

try {
    writer = WriterFactory.getWriter(options.output, {
        wavSampleRate: parseInt(options.rate),
        wavTurbo: options.turbo
    });
} catch (err) {
    const error = err as Error;
    console.log(chalk.red('✗ Failed to get output writer: ') + error.message);
    process.exit(1);
}

let filesToWrite: C64FileInfo[] = [];
if (options.files === 'auto') {
    if (writer.supportsMultipleFiles()) filesToWrite = info.files;
    else filesToWrite = [info.files[0]];
} else if (options.files === 'all') {
    filesToWrite = info.files;
} else {
    const fileIndex = parseInt(options.files);
    if (isNaN(fileIndex) || fileIndex < 1 || fileIndex > info.files.length) {
        console.log(
            chalk.red('✗ Invalid file index: ') +
                options.files +
                ' (must be 1-' +
                info.files.length +
                ')'
        );
        process.exit(1);
    }
    const file = info.files.find((f) => f.index == fileIndex);
    if (!file) {
        console.log(chalk.red('✗ File index not found!'));
        process.exit(1);
    }
    filesToWrite = [file];
}

try {
    await writer.writeData(filesToWrite);
    const outputStat = await stat(options.output);
    const fileSize = outputStat.size;
    const sizeMB = (fileSize / (1024 * 1024)).toFixed(2);
    const sizeBytes = fileSize.toLocaleString();

    console.log(
        '\n' +
            chalk.green('✓ Successfully wrote to ') +
            chalk.bold(options.output)
    );
    console.log(
        '  ' +
            chalk.yellow('Size:') +
            ' ' +
            sizeBytes +
            ' bytes (' +
            sizeMB +
            ' MB)'
    );
    writer.printInfo();
} catch (err) {
    const error = err as Error;
    console.log('\n' + chalk.red('✗ Failed to write output: ') + error.message);
    process.exit(1);
}
