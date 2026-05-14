import { C64FileInfo } from '../types/index.js';

const CLOCK_CYCLES = 985248;

export type TapePulseCallback = (pulseCycles: number) => void;
export type TapeProgressCallback = (current: number, total: number) => void;
export type TapeProgressStartCallback = (total: number) => void;
export type TapeProgressFinishCallback = () => void;

export interface TapePulseGeneratorOptions {
    pulseCallback: TapePulseCallback;
    progressStartCallback?: TapeProgressStartCallback;
    progressCallback?: TapeProgressCallback;
    progressFinishCallback?: TapeProgressFinishCallback;
}

export abstract class TapePulseGenerator {
    private callback: TapePulseCallback;
    private progressCallback: TapeProgressCallback | undefined;
    private progressStartCallback: TapeProgressStartCallback | undefined;
    private progressFinishCallback: TapeProgressFinishCallback | undefined;
    protected constructor(options: TapePulseGeneratorOptions) {
        this.callback = options.pulseCallback;
        this.progressCallback = options.progressCallback;
        this.progressStartCallback = options.progressStartCallback;
        this.progressFinishCallback = options.progressFinishCallback;
    }

    protected startProgress(total: number) {
        if (this.progressStartCallback) this.progressStartCallback(total);
    }
    protected finishProgress() {
        if (this.progressFinishCallback) this.progressFinishCallback();
    }
    protected updateProgress(current: number, total: number) {
        if (this.progressCallback) this.progressCallback(current, total);
    }

    sendCustomPulse(pulseCycles: number): void {
        if (pulseCycles <= 0) {
            throw new Error(
                'Invalid pulse length. Did you forget to set pulse lengths?'
            );
        }
        this.callback(pulseCycles);
    }

    sendPause(pauseMs: 'Header' | number) {
        var finalVal = 0;
        if (typeof pauseMs == 'number') finalVal = pauseMs;
        else {
            switch (pauseMs) {
                case 'Header':
                    finalVal = 5000;
                    break;
                default:
                    throw new Error('Bad pause value');
            }
        }

        this.sendCustomPulse(Math.round((finalVal / 1000) * CLOCK_CYCLES));
    }
    abstract generatePulses(file: C64FileInfo, hdrCode?: Buffer): Promise<void>;
}
