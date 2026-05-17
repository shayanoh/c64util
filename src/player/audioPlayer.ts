import Speaker from 'speaker';
import blessed from 'blessed';

const WAV_HEADER_SIZE = 44;
const CHANNELS = 1;
const BITS_PER_SAMPLE = 8;

function formatTime(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export async function playWavBuffer(
    wavBuffer: Buffer,
    sampleRate: number,
    title: string
): Promise<void> {
    const pcmData = wavBuffer.subarray(WAV_HEADER_SIZE);
    const frameSize = CHANNELS * (BITS_PER_SAMPLE / 8);
    const bytesPerSecond = sampleRate * frameSize;
    const totalDuration = pcmData.length / bytesPerSecond;
    const skipBytes = bytesPerSecond * 5;
    const chunkIntervalMs = 100;
    const chunkBytes = Math.round((bytesPerSecond * chunkIntervalMs) / 1000);

    const originalStderrWrite = process.stderr.write;
    process.stderr.write = function (
        chunk: any,
        encoding?: any,
        callback?: any
    ): boolean {
        const str = typeof chunk === 'string' ? chunk : chunk.toString();
        if (str.includes('buffer underflow') || str.includes('coreaudio.c')) {
            if (typeof callback === 'function') callback();
            return true;
        }
        return originalStderrWrite.apply(
            process.stderr,
            arguments as unknown as [any, any, any]
        );
    };

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
        content: `{yellow-fg}${title}{/yellow-fg}`
    });

    const progressBar = blessed.ProgressBar({
        parent: box,
        top: 3,
        left: 2,
        width: '100%-5',
        height: 3,
        border: { type: 'line' },
        style: { bar: { bg: 'cyan', fg: 'black' }, border: { fg: 'gray' } }
    });

    const timeDisplay = blessed.text({
        parent: box,
        top: 6,
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
            '{gray-fg}space: pause  ←: back 5s  →: forward 5s  q: back{/gray-fg}'
    });

    let currentByte = 0;
    let isPaused = false;
    let isFinished = false;

    function updateDisplay() {
        const elapsed = currentByte / bytesPerSecond;
        const progress = Math.min(elapsed / totalDuration, 1);
        progressBar.setProgress(progress * 100);
        timeDisplay.setContent(
            `{white-fg}${formatTime(elapsed)}{/white-fg} / {gray-fg}${formatTime(totalDuration)}{/gray-fg}`
        );
        screen.render();
    }

    const speaker = new Speaker({
        sampleRate,
        channels: CHANNELS,
        bitDepth: BITS_PER_SAMPLE
    });

    screen.render();

    let resolveFn: (value: void) => void;

    speaker.on('close', () => {
        isFinished = true;
        clearInterval(playbackInterval);
        process.stderr.write = originalStderrWrite;
        statusText.setContent('{yellow-fg}■ Finished{/yellow-fg}');
        screen.render();
        setTimeout(() => {
            screen.destroy();
            resolveFn();
        }, 1000);
    });

    speaker.on('error', (err: Error) => {
        clearInterval(playbackInterval);
        process.stderr.write = originalStderrWrite;
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
        currentByte = Math.min(pcmData.length, currentByte + skipBytes);
        updateDisplay();
    });

    screen.key(['escape', 'q', 'C-c'], () => {
        clearInterval(playbackInterval);
        process.stderr.write = originalStderrWrite;
        speaker.end();
    });

    // The timer is not guarrantied to fire at exact time, so we need to compensate
    // for it being late, so there won't be gaps in the audio stream. We will add
    // a buffer of about 200ms and keep ahead of the playback stream so there won't
    // be any interruptions
    const TARGET_BUFFER_MS = 200;
    const targetBufferBytes =
        Math.floor((TARGET_BUFFER_MS * bytesPerSecond) / 1000 / frameSize) *
        frameSize;

    let totalWrittenBytes = 0;
    const playbackStartTime = performance.now();

    // Pre-fill the buffer with silence before starting the interval
    speaker.write(Buffer.alloc(targetBufferBytes, 0x80));
    totalWrittenBytes = 0;
    currentByte = 0;

    const playbackInterval = setInterval(() => {
        if (isFinished) return;

        // How many bytes has the hardware consumed so far?
        const elapsedMs = performance.now() - playbackStartTime;
        const consumedBytes = (elapsedMs * bytesPerSecond) / 1000;

        // How deep is our buffer right now?
        const bufferDepth = totalWrittenBytes - consumedBytes;

        // How many bytes do we need to write to reach our target depth?
        let bytesToWrite = Math.ceil(targetBufferBytes - bufferDepth);
        bytesToWrite = Math.max(
            0,
            Math.ceil(bytesToWrite / frameSize) * frameSize
        ); // frame-align

        if (bytesToWrite === 0) return;

        if (currentByte >= pcmData.length) {
            speaker.end();
            return;
        }

        if (isPaused) {
            speaker.write(Buffer.alloc(bytesToWrite, 0x80));
            totalWrittenBytes += bytesToWrite;
            return;
        }

        const end = Math.min(currentByte + bytesToWrite, pcmData.length);
        const chunkToWrite = pcmData.subarray(currentByte, end);

        // If we're near the end, pad with silence to avoid a partial underrun
        if (chunkToWrite.length < bytesToWrite) {
            const padded = Buffer.alloc(bytesToWrite, 0);
            chunkToWrite.copy(padded);
            speaker.write(padded);
        } else {
            speaker.write(chunkToWrite);
        }

        currentByte += chunkToWrite.length;
        totalWrittenBytes += bytesToWrite;
        updateDisplay();
    }, chunkIntervalMs);

    return new Promise((resolve) => {
        resolveFn = resolve;
    });
}
