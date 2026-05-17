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
    const bytesPerSecond = sampleRate * CHANNELS * (BITS_PER_SAMPLE / 8);
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
    const silenceBuffer = Buffer.alloc(chunkBytes, 0x80);

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

    const playbackInterval = setInterval(() => {
        if (isFinished) return;

        if (currentByte >= pcmData.length) {
            speaker.end();
            return;
        }

        if (isPaused) {
            speaker.write(silenceBuffer);
            return;
        }

        const chunk = pcmData.subarray(currentByte, currentByte + chunkBytes);
        currentByte += chunk.length;
        updateDisplay();

        speaker.write(chunk);
    }, chunkIntervalMs);

    return new Promise((resolve) => {
        resolveFn = resolve;
    });
}
