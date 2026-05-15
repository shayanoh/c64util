import blessed from 'blessed';
import { C64FileInfo } from '../types/index.js';

interface SelectResult {
    file: C64FileInfo;
    turbo: boolean;
}

export async function selectFile(
    files: C64FileInfo[],
    inputType: string
): Promise<SelectResult | null> {
    await new Promise((r) => setTimeout(r, 50));
    process.stdout.write('\x1b[2J\x1b[H');

    const screen = blessed.screen({
        smartCSR: true,
        fullUnicode: true,
        dockBorders: true
    });

    const boxHeight = Math.min(files.length + 9, 21);
    const boxWidth = 72;

    const box = blessed.box({
        parent: screen,
        top: 'center',
        left: 'center',
        width: boxWidth,
        height: boxHeight,
        border: { type: 'line' },
        style: { border: { fg: 'cyan' } }
    });

    let headerText = '';
    if (inputType === 'T64') {
        headerText = 'T64 Tape Image';
    } else if (inputType === 'PRG') {
        headerText = 'PRG File';
    } else if (inputType === 'D64') {
        headerText = 'D64 Disk Image';
    } else {
        headerText = 'Input File';
    }

    blessed.text({
        parent: box,
        top: 0,
        left: 2,
        tags: true,
        content: `{yellow-fg}${headerText}{/yellow-fg}`
    });

    blessed.text({
        parent: box,
        top: 1,
        left: 2,
        tags: true,
        content: '{white-fg}Select a program to play:{/white-fg}'
    });

    const modeText = blessed.text({
        parent: box,
        top: 2,
        left: 2,
        tags: true,
        content: '{white-fg}Mode: Kernal (t: toggle){/white-fg}'
    });

    const listHeight = Math.min(files.length + 2, boxHeight - 6);
    const list = blessed.list({
        parent: box,
        top: 4,
        left: 2,
        width: '100%-4',
        height: listHeight,
        border: { type: 'line' },
        style: {
            border: { fg: 'gray' },
            selected: { bg: 'cyan', fg: 'black' },
            item: { fg: 'white' }
        },
        keys: true,
        mouse: true
    });

    blessed.text({
        parent: box,
        bottom: 0,
        left: 2,
        tags: true,
        content:
            '{gray-fg}up/down: navigate  enter: play  t: turbo  q: quit{/gray-fg}'
    });

    files.forEach((f, i) => {
        const addrRange = `$${f.startAddr.toString(16).toUpperCase().padStart(4, '0')}-$${f.endAddr.toString(16).toUpperCase().padStart(4, '0')}`;
        const namePadded = ('"' + f.name + '"').padEnd(18);
        const label = `#${i + 1}  ${f.type.padEnd(4)}  ${namePadded}  ${addrRange}  (${f.size} bytes)`;
        list.add(label);
    });

    let turbo = false;

    function updateModeDisplay() {
        const mode = turbo
            ? '{white-fg}Mode:{/white-fg} {red-fg}Turbo{/red-fg} {white-fg}(t: toggle){/white-fg}'
            : '{white-fg}Mode: Kernal (t: toggle){/white-fg}';
        modeText.setContent(mode);
        screen.render();
    }

    list.focus();
    list.select(0);
    screen.render();

    return new Promise((resolve) => {
        list.key(['enter'], () => {
            const selected = list.selected;
            if (selected !== null && selected >= 0 && selected < files.length) {
                screen.destroy();
                resolve({ file: files[selected], turbo });
            }
        });

        list.key(['t'], () => {
            turbo = !turbo;
            updateModeDisplay();
        });

        list.key(['escape', 'q', 'C-c'], () => {
            screen.destroy();
            resolve(null);
        });
    });
}
