import { readFile } from 'fs/promises';
import Speaker from 'speaker';
import blessed from 'blessed';

interface WavInfo {
    sampleRate: number;
    channels: number;
    bitsPerSample: number;
    dataOffset: number;
    dataSize: number;
    pcmData: Buffer;
}

function parseWav(buffer: Buffer): WavInfo {
    if (buffer.subarray(0, 4).toString() !== 'RIFF') {
        throw new Error('Not a valid WAV file: missing RIFF header');
    }
    if (buffer.subarray(8, 12).toString() !== 'WAVE') {
        throw new Error('Not a valid WAV file: missing WAVE chunk');
    }

    let offset = 12;
    let dataOffset = 0;
    let dataSize = 0;
    let sampleRate = 0;
    let channels = 0;
    let bitsPerSample = 0;

    while (offset < buffer.length) {
        const chunkId = buffer.subarray(offset, offset + 4).toString();
        const chunkSize = buffer.readUInt32LE(offset + 4);

        if (chunkId === 'fmt ') {
            channels = buffer.readUInt16LE(offset + 10);
            sampleRate = buffer.readUInt32LE(offset + 12);
            bitsPerSample = buffer.readUInt16LE(offset + 22);
        } else if (chunkId === 'data') {
            dataOffset = offset + 8;
            dataSize = chunkSize;
            break;
        }

        offset += 8 + chunkSize;
    }

    if (dataOffset === 0) {
        throw new Error('No data chunk found in WAV file');
    }

    const pcmData = buffer.subarray(dataOffset, dataOffset + dataSize);

    return {
        sampleRate,
        channels,
        bitsPerSample,
        dataOffset,
        dataSize,
        pcmData
    };
}

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function playWav(filePath: string): Promise<void> {
    const fileBuffer = await readFile(filePath);
    const wav = parseWav(fileBuffer);

    const totalDuration =
        wav.dataSize /
        (wav.sampleRate * wav.channels * (wav.bitsPerSample / 8));
    const bytesPerSecond =
        wav.sampleRate * wav.channels * (wav.bitsPerSample / 8);
    const skipBytes = bytesPerSecond * 5;
    const chunkIntervalMs = 100;
    const chunkBytes = Math.round((bytesPerSecond * chunkIntervalMs) / 1000);

    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        dockBorders: true
    });

    const box = blessed.box({
        parent: screen,
        top: 'center',
        left: 'center',
        width: 60,
        height: 12,
        border: { type: 'line' },
        style: { border: { fg: 'cyan' } }
    });

    blessed.text({
        parent: box,
        top: 1,
        left: 2,
        tags: true,
        content: `{yellow-fg}${filePath.split('/').pop()}{/yellow-fg}`
    });

    const progressBar = blessed.ProgressBar({
        parent: box,
        top: 3,
        left: 2,
        width: '100%-4',
        height: 1,
        border: { type: 'line' },
        style: { bar: { bg: 'cyan', fg: 'black' }, border: { fg: 'gray' } }
    });

    const timeDisplay = blessed.text({
        parent: box,
        top: 5,
        left: 2,
        tags: true,
        content: ''
    });

    const statusText = blessed.text({
        parent: box,
        top: 7,
        left: 2,
        tags: true,
        content: '{green-fg}▶ Playing{/green-fg}'
    });

    blessed.text({
        parent: box,
        bottom: 1,
        left: 2,
        tags: true,
        content:
            '{gray-fg}space: pause  ←: back 5s  →: forward 5s  q: quit{/gray-fg}'
    });

    let currentByte = 0;
    let isPaused = false;
    let isFinished = false;

    function updateDisplay() {
        const elapsed = currentByte / bytesPerSecond;
        const progress = Math.min(elapsed / totalDuration, 1);
        progressBar.setProgress(progress);
        timeDisplay.setContent(
            `{white-fg}${formatTime(elapsed)}{/white-fg} / {gray-fg}${formatTime(totalDuration)}{/gray-fg}`
        );
        screen.render();
    }

    const speaker = new Speaker({
        sampleRate: wav.sampleRate,
        channels: wav.channels,
        bitDepth: wav.bitsPerSample
    });

    screen.render();

    speaker.on('close', () => {
        isFinished = true;
        clearInterval(playbackInterval);
        statusText.setContent('{yellow-fg}■ Finished{/yellow-fg}');
        screen.render();
        setTimeout(() => {
            screen.destroy();
        }, 1000);
    });

    speaker.on('error', (err: Error) => {
        clearInterval(playbackInterval);
        screen.destroy();
        throw err;
    });

    screen.key(['space'], () => {
        isPaused = !isPaused;
        if (isPaused) {
            statusText.setContent('{red-fg}❚❚ Paused{/red-fg}');
        } else {
            statusText.setContent('{green-fg}▶ Playing{/green-fg}');
        }
        screen.render();
    });

    screen.key(['left'], () => {
        currentByte = Math.max(0, currentByte - skipBytes);
        updateDisplay();
    });

    screen.key(['right'], () => {
        currentByte = Math.min(wav.pcmData.length, currentByte + skipBytes);
        updateDisplay();
    });

    screen.key(['escape', 'q', 'C-c'], () => {
        clearInterval(playbackInterval);
        speaker.end();
        screen.destroy();
    });

    const playbackInterval = setInterval(() => {
        if (isPaused || isFinished) return;

        if (currentByte >= wav.pcmData.length) {
            speaker.end();
            return;
        }

        const chunk = wav.pcmData.subarray(
            currentByte,
            currentByte + chunkBytes
        );
        currentByte += chunk.length;
        updateDisplay();

        speaker.write(chunk);
    }, chunkIntervalMs);

    return new Promise((resolve) => {
        speaker.on('close', () => {
            resolve();
        });
    });
}
