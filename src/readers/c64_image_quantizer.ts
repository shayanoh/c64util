import { privateDecrypt, privateEncrypt } from 'node:crypto';
import { promises } from 'node:dns';
import sharp from 'sharp';

type BlockData = {
    /** 32 RGB pixels, row-major 8×4 */
    pixels: [number, number, number][];
    /** 32 LAB values, row-major 8×4 */
    labs: [number, number, number][];
};
export interface C64Block {
    /** Palette indices: [background, local1, local2, local3] */
    colors: [number, number, number, number];
    colorsPalette: [number, number, number][];
    /** 32 entries, each a palette index from `colors` */
    pixels: number[];
}

export interface C64Bitmap {
    background: number;
    backgroundPalette: [number, number, number];
    blocks: C64Block[];
}

class ColorRoutines {
    static srgbToLinear(c: number): number {
        const s = c / 255;
        return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    }

    static linearToSrgb(c: number): number {
        return c <= 0.0031308
            ? c * 12.92
            : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;
    }

    static linearToXyz(
        r: number,
        g: number,
        b: number
    ): [number, number, number] {
        // sRGB -> XYZ D65 (IEC 61966-2-1)
        const x = r * 0.4124564 + g * 0.3575761 + b * 0.1804375;
        const y = r * 0.2126729 + g * 0.7151522 + b * 0.072175;
        const z = r * 0.0193339 + g * 0.119192 + b * 0.9503041;
        return [x, y, z];
    }

    static xyzToLab(x: number, y: number, z: number): [number, number, number] {
        // D65 reference white
        const xn = 0.95047,
            yn = 1.0,
            zn = 1.08883;
        const f = (t: number) =>
            t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116;
        const fx = f(x / xn),
            fy = f(y / yn),
            fz = f(z / zn);
        return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
    }

    static rgbToLab(r: number, g: number, b: number): [number, number, number] {
        const lr = ColorRoutines.srgbToLinear(r);
        const lg = ColorRoutines.srgbToLinear(g);
        const lb = ColorRoutines.srgbToLinear(b);
        const [x, y, z] = ColorRoutines.linearToXyz(lr, lg, lb);
        return ColorRoutines.xyzToLab(x, y, z);
    }

    // --- ΔE CIE76 ---
    static readonly SATURATION_BOOST = 1.6; // tune: 1.0 = no effect, 1.5 = strong

    static boostChroma(
        lab: [number, number, number]
    ): [number, number, number] {
        const [L, a, b] = lab;
        return [
            L,
            a * ColorRoutines.SATURATION_BOOST,
            b * ColorRoutines.SATURATION_BOOST
        ];
    }

    static deltaE76(
        [l1, a1, b1]: [number, number, number],
        [l2, a2, b2]: [number, number, number]
    ): number {
        return Math.sqrt((l1 - l2) ** 2 + (a1 - a2) ** 2 + (b1 - b2) ** 2);
    }

    static readonly NEUTRAL_PENALTY = 1.8; // tune this: 1.0 = no effect, 2.0 = strong
    static readonly CHROMA_THRESHOLD = 30; // Lab chroma below this is considered "neutral"

    static deltaE76Penalized(
        sourceLab: [number, number, number],
        candidate: [number, number, number]
    ): number {
        const base = ColorRoutines.deltaE76(sourceLab, candidate);
        const chroma = Math.sqrt(
            candidate[1] * candidate[1] + candidate[2] * candidate[2]
        );
        const penalty =
            chroma < ColorRoutines.CHROMA_THRESHOLD
                ? ColorRoutines.NEUTRAL_PENALTY -
                  (chroma / ColorRoutines.CHROMA_THRESHOLD) *
                      (ColorRoutines.NEUTRAL_PENALTY - 1.0)
                : 1.0;
        return base * penalty;
    }
}

export class C64ImageQuantizer {
    readonly filePath: string;
    readonly processed: boolean = false;
    readonly dither: boolean;
    readonly progressStartCallback?: (total: number, message: string) => void;
    readonly progressCallback?: (current: number, total: number) => void;
    readonly progressFinishCallback?: () => void;

    constructor(
        filePath: string,
        dither?: boolean,
        extendedColors?: boolean,
        progressStartCallback?: (total: number, message: string) => void,
        progressCallback?: (current: number, total: number) => void,
        progressFinishCallback?: () => void
    ) {
        this.filePath = filePath;
        this.dither = dither ?? false;
        this.progressStartCallback = progressStartCallback;
        this.progressCallback = progressCallback;
        this.progressFinishCallback = progressFinishCallback;
        this.precalculateColors(extendedColors);
    }

    // They are only in hex, so the color preview in VSCode works on them!
    private C64Pallete: string[] = [
        '#000000',
        '#FFFFFF',
        '#68372b',
        '#70a4b2',
        '#6f3d86',
        '#588d43',
        '#352879',
        '#b8c252',
        '#6f4f25',
        '#433900',
        '#9a6759',
        '#444444',
        '#6c6c6c',
        '#9ad284',
        '#6c5eb5',
        '#959595'
    ];

    private C64PaletteRGB: [number, number, number][] = [];
    private C64PaletteLAB: [number, number, number][] = [];

    private readonly LUT_BITS = 5; // 5 bits per channel → 32 steps
    private readonly LUT_SIZE = 1 << this.LUT_BITS; // 32
    private readonly LUT_SHIFT = 8 - this.LUT_BITS; // 3
    private C64PaletteLUT: number[] = [];
    private buildRgbLut() {
        const lut = new Array(this.LUT_SIZE * this.LUT_SIZE * this.LUT_SIZE);

        for (let ri = 0; ri < this.LUT_SIZE; ri++) {
            for (let gi = 0; gi < this.LUT_SIZE; gi++) {
                for (let bi = 0; bi < this.LUT_SIZE; bi++) {
                    // Map bucket center back to 0-255
                    const r =
                        (ri << this.LUT_SHIFT) + (1 << (this.LUT_SHIFT - 1));
                    const g =
                        (gi << this.LUT_SHIFT) + (1 << (this.LUT_SHIFT - 1));
                    const b =
                        (bi << this.LUT_SHIFT) + (1 << (this.LUT_SHIFT - 1));
                    const lab = ColorRoutines.boostChroma(
                        ColorRoutines.rgbToLab(r, g, b)
                    );

                    let bestIdx = 0,
                        bestDist = Infinity;
                    for (let i = 0; i < this.C64PaletteLAB.length; i++) {
                        const d = ColorRoutines.deltaE76Penalized(
                            lab,
                            this.C64PaletteLAB[i]
                        );
                        if (d < bestDist) {
                            bestDist = d;
                            bestIdx = i;
                        }
                    }
                    lut[
                        (ri << (this.LUT_BITS * 2)) | (gi << this.LUT_BITS) | bi
                    ] = bestIdx;
                }
            }
        }
        this.C64PaletteLUT = lut;
    }

    private perceivedMixColor(
        rgb1: [number, number, number],
        rgb2: [number, number, number]
    ): [number, number, number] {
        // Remove gamma, average in linear light, re-apply gamma

        const r = ColorRoutines.linearToSrgb(
            (ColorRoutines.srgbToLinear(rgb1[0]) +
                ColorRoutines.srgbToLinear(rgb2[0])) /
                2
        );
        const g = ColorRoutines.linearToSrgb(
            (ColorRoutines.srgbToLinear(rgb1[1]) +
                ColorRoutines.srgbToLinear(rgb2[1])) /
                2
        );
        const b = ColorRoutines.linearToSrgb(
            (ColorRoutines.srgbToLinear(rgb1[2]) +
                ColorRoutines.srgbToLinear(rgb2[2])) /
                2
        );

        return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
    }
    private precalculateColors(extendColors?: boolean) {
        const hexToRgb = (hex: string): [number, number, number] => {
            const bigint = parseInt(hex.slice(1), 16);
            return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
        };
        const rgbToHex = (r: number, g: number, b: number): string => {
            return (
                r.toString(16).padStart(2, '0') +
                g.toString(16).padStart(2, '0') +
                b.toString(16).padStart(2, '0')
            );
        };
        if (extendColors) {
            this.C64PaletteRGB = [];
            for (let i = 0; i < 256; i++) this.C64PaletteRGB.push([0, 0, 0]);
            for (let i = 0; i < 16; i++) {
                const [r1, g1, b1] = hexToRgb(this.C64Pallete[i]);
                for (let j = 0; j < 16; j++) {
                    const [r2, g2, b2] = hexToRgb(this.C64Pallete[j]);
                    const [r, g, b] = this.perceivedMixColor(
                        [r1, g1, b1],
                        [r2, g2, b2]
                    );
                    this.C64PaletteRGB[i * 16 + j] = [r, g, b];
                }
            }
        } else {
            this.C64PaletteRGB = this.C64Pallete.map(hexToRgb);
        }
        this.C64PaletteLAB = this.C64PaletteRGB.map(([r, g, b]) =>
            ColorRoutines.rgbToLab(r, g, b)
        );
        this.buildRgbLut();
    }

    private nearestC64Color(r: number, g: number, b: number): number {
        const ri = r >> this.LUT_SHIFT;
        const gi = g >> this.LUT_SHIFT;
        const bi = b >> this.LUT_SHIFT;
        return this.C64PaletteLUT[
            (ri << (this.LUT_BITS * 2)) | (gi << this.LUT_BITS) | bi
        ];
    }
    private nearestC64ColorConstrained(
        lab: [number, number, number],
        allowedIndices: number[]
    ): number {
        const boosted = ColorRoutines.boostChroma(lab);
        let bestIdx = allowedIndices[0];
        let bestDist = Infinity;
        for (const i of allowedIndices) {
            const d = ColorRoutines.deltaE76Penalized(
                boosted,
                this.C64PaletteLAB[i]
            );
            if (d < bestDist) {
                bestDist = d;
                bestIdx = i;
            }
        }
        return bestIdx;
    }

    private imageWidth: number = 0;
    private imageHeight: number = 0;
    private pixels: [number, number, number][] = []; // [r, g, b]
    private pixelsDither: [number, number, number][] = []; // [r,g,b] float for dithering

    private async loadImage(): Promise<void> {
        let image = sharp(this.filePath);
        image = await image
            .metadata()
            .then((metadata) => {
                const aspect = metadata.width / metadata.height;
                this.imageWidth = 320;
                this.imageHeight = Math.round(this.imageWidth / aspect);
                if (this.imageHeight > 200) {
                    this.imageHeight = 200;
                    this.imageWidth = Math.round(this.imageHeight * aspect);
                }
                this.imageWidth = Math.round(this.imageWidth / 2);
                return image
                    .resize({
                        width: this.imageWidth,
                        height: this.imageHeight,
                        fit: 'fill'
                    })
                    .normalise();
            })
            .catch((err) => {
                throw new Error('Error processing image:' + err);
            });
        console.log(
            `\n\nResized image to ${this.imageWidth}x${this.imageHeight} = ` +
                `${this.imageWidth * this.imageHeight} pixels`
        );
        console.log(
            `Apparent size will be ${this.imageWidth * 2}x${this.imageHeight}\n`
        );
        const imageBuffer = await image.raw({ depth: 'uchar' }).toBuffer();
        for (let i = 0; i < imageBuffer.length; i += 3) {
            const r = imageBuffer[i + 0];
            const g = imageBuffer[i + 1];
            const b = imageBuffer[i + 2];
            this.pixels.push([r, g, b]);
            this.pixelsDither.push([r * 1.0, g * 1.0, b * 1.0]);
        }
    }

    private blocksWidth: number = 0;
    private blocksHeight: number = 0;

    private blocks: BlockData[] = [];

    private imageToBlocks(): void {
        this.blocksHeight = Math.floor(this.imageHeight / 8);
        this.blocksWidth = Math.floor(this.imageWidth / 4);
        for (let by = 0; by < this.blocksHeight; by++) {
            for (let bx = 0; bx < this.blocksWidth; bx++) {
                const blockPixels: [number, number, number][] = [];
                for (let y = 0; y < 8; y++) {
                    for (let x = 0; x < 4; x++) {
                        const px = bx * 4 + x;
                        const py = by * 8 + y;
                        blockPixels.push(
                            this.pixels[py * this.imageWidth + px]
                        );
                    }
                }
                this.blocks.push({
                    pixels: blockPixels,
                    labs: blockPixels.map(([r, g, b]) =>
                        ColorRoutines.rgbToLab(r, g, b)
                    )
                });
            }
        }
    }

    private chooseBestBackground(
        allBlockRGBs: [number, number, number][][]
    ): number {
        let colorCount: number[] = new Array(this.C64PaletteLAB.length);
        colorCount.fill(0);
        this.progressStartCallback?.(
            allBlockRGBs.length,
            'Finding best background color...'
        );
        let idx = 0;
        for (const blockRGB of allBlockRGBs) {
            blockRGB.forEach(([r, g, b]) => {
                colorCount[this.nearestC64Color(r, g, b)]++;
            });
            this.progressCallback?.(++idx, allBlockRGBs.length);
        }
        this.progressCallback?.(1, 1);
        this.progressFinishCallback?.();

        let bgIdx = 0;
        let bgIdxCount = 0;
        colorCount.forEach((count, idx) => {
            if (count > bgIdxCount) {
                bgIdxCount = count;
                bgIdx = idx;
            }
        });
        return bgIdx;
    }

    private kMeans(
        labs: [number, number, number][],
        k: number,
        iterations = 10
    ): [number, number, number][] {
        // Seed with evenly spaced picks from the data
        let centroids = Array.from(
            { length: k },
            (_, i) => labs[Math.floor((i / k) * labs.length)]
        ) as [number, number, number][];

        for (let iter = 0; iter < iterations; iter++) {
            // Assign
            const clusters: [number, number, number][][] = Array.from(
                { length: k },
                () => []
            );
            for (const lab of labs) {
                let best = 0,
                    bestD = Infinity;
                for (let i = 0; i < k; i++) {
                    const d = ColorRoutines.deltaE76Penalized(
                        lab,
                        centroids[i]
                    );
                    if (d < bestD) {
                        bestD = d;
                        best = i;
                    }
                }
                clusters[best].push(lab);
            }
            // Recompute centroids
            centroids = clusters.map((cluster, i) => {
                if (cluster.length === 0) return centroids[i];
                const avg = [0, 0, 0] as [number, number, number];
                for (const [l, a, b] of cluster) {
                    avg[0] += l;
                    avg[1] += a;
                    avg[2] += b;
                }
                return avg.map((v) => v / cluster.length) as [
                    number,
                    number,
                    number
                ];
            });
        }
        return centroids;
    }

    private bestColorsForBlock(
        pixelLabs: [number, number, number][],
        bgIdx: number
    ): [number, number, number] {
        // Find ideal 3 colors via k-means
        const idealCentroids = this.kMeans(pixelLabs, 3);

        // Snap each centroid to nearest palette entry (excluding background)
        const snapped = idealCentroids.map((centroid) => {
            let best = 0,
                bestD = Infinity;
            for (let i = 0; i < this.C64PaletteLAB.length; i++) {
                if (i === bgIdx) continue;
                const d = ColorRoutines.deltaE76Penalized(
                    centroid,
                    this.C64PaletteLAB[i]
                );
                if (d < bestD) {
                    bestD = d;
                    best = i;
                }
            }
            return best;
        });

        // Deduplicate (k-means may snap two centroids to the same color)
        const unique = [...new Set(snapped)];
        while (unique.length < 3) {
            // Fill remaining slots with least-used palette entries
            for (let i = 0; i < this.C64PaletteLAB.length; i++) {
                if (i !== bgIdx && !unique.includes(i)) {
                    unique.push(i);
                    break;
                }
            }
        }

        return [unique[0], unique[1], unique[2]];
    }

    private quantizeBlock(
        pixelLabs: [number, number, number][],
        allowedIndices: number[]
    ): number[] {
        return pixelLabs.map((lab) =>
            this.nearestC64ColorConstrained(lab, allowedIndices)
        );
    }

    // -----------------------------------------------------------------------------
    // Quantize a block's pixels with Floyd-Steinberg dithering
    // (error diffused in RGB, lookup done in Lab)
    // -----------------------------------------------------------------------------

    private quantizeBlockDithered(
        pixels: [number, number, number][], // original RGB pixels, row-major 8×4
        blockX: number,
        blockY: number,
        allowedIndices: number[]
    ): number[] {
        const clamp = (v: number) => Math.max(0, Math.min(255, v));
        const YSIZE = 8;
        const XSIZE = 4;

        const result: number[] = new Array(XSIZE * YSIZE);

        for (let y = 0; y < YSIZE; y++) {
            for (let x = 0; x < XSIZE; x++) {
                const wi = (y + blockY) * this.imageWidth + (x + blockX);
                const pixel =
                    y + blockY < this.imageHeight &&
                    x + blockX < this.imageWidth
                        ? this.pixelsDither[wi]
                        : [0, 0, 0];
                const r = clamp(pixel[0]);
                const g = clamp(pixel[1]);
                const b = clamp(pixel[2]);

                const lab = ColorRoutines.boostChroma(
                    ColorRoutines.rgbToLab(r, g, b)
                );
                const paletteIdx = this.nearestC64ColorConstrained(
                    lab,
                    allowedIndices
                );
                result[y * XSIZE + x] = allowedIndices.indexOf(paletteIdx);

                const [pr, pg, pb] = this.C64PaletteRGB[paletteIdx];
                const er = r - pr;
                const eg = g - pg;
                const eb = b - pb;

                const diffuse = (nx: number, ny: number, factor: number) => {
                    if (
                        nx + blockX < 0 ||
                        nx + blockX >= this.imageWidth ||
                        ny + blockY < 0 ||
                        ny + blockY >= this.imageHeight
                    )
                        return;
                    const ni = (ny + blockY) * this.imageWidth + (nx + blockX);
                    this.pixelsDither[ni][0] += er * factor;
                    this.pixelsDither[ni][1] += eg * factor;
                    this.pixelsDither[ni][2] += eb * factor;
                };

                const damping = 0.7;
                diffuse(x + 1, y, damping * (7 / 16));
                diffuse(x - 1, y + 1, damping * (3 / 16));
                diffuse(x, y + 1, damping * (5 / 16));
                diffuse(x + 1, y + 1, damping * (1 / 16));
            }
        }

        return result;
    }

    private quantizeBlocks(bgIdx: number): C64Block[] {
        this.progressStartCallback?.(
            this.blocks.length,
            'Quantizing blocks...'
        );
        const outputBlocks: C64Block[] = this.blocks.map(
            ({ pixels, labs }, index) => {
                this.progressCallback?.(index, this.blocks.length);
                const [c1, c2, c3] = this.bestColorsForBlock(labs, bgIdx);
                const allowed: [number, number, number, number] = [
                    bgIdx,
                    c1,
                    c2,
                    c3
                ];

                const blockY = Math.floor(index / this.blocksWidth) * 8;
                const blockX = (index % this.blocksWidth) * 4;
                const quantized = this.dither
                    ? this.quantizeBlockDithered(
                          pixels,
                          blockX,
                          blockY,
                          allowed
                      )
                    : this.quantizeBlock(labs, allowed);
                return {
                    colors: allowed,
                    pixels: quantized,
                    colorsPalette: allowed.map((idx) => this.C64PaletteRGB[idx])
                };
            }
        );
        this.progressCallback?.(this.blocks.length, this.blocks.length);
        this.progressFinishCallback?.();
        return outputBlocks;
    }

    async processImage(): Promise<C64Bitmap> {
        await this.loadImage();
        this.imageToBlocks();
        const bgIdx = this.chooseBestBackground(
            this.blocks.map((b) => b.pixels)
        );
        const outputBlocks = this.quantizeBlocks(bgIdx);
        const fullscreenOutputBlocks: C64Block[] = [];
        for (let by = 0; by < 25; by++) {
            for (let bx = 0; bx < 40; bx++) {
                if (by < this.blocksHeight && bx < this.blocksWidth) {
                    fullscreenOutputBlocks.push(
                        outputBlocks[by * this.blocksWidth + bx]
                    );
                } else {
                    // Pad with empty blocks if image is smaller than 320x200
                    fullscreenOutputBlocks.push({
                        colors: [bgIdx, 0, 0, 0],
                        colorsPalette: [
                            this.C64PaletteRGB[bgIdx],
                            this.C64PaletteRGB[0],
                            this.C64PaletteRGB[0],
                            this.C64PaletteRGB[0]
                        ],
                        pixels: new Array(64).fill(0)
                    });
                }
            }
        }
        return {
            background: bgIdx,
            backgroundPalette: this.C64PaletteRGB[bgIdx],
            blocks: fullscreenOutputBlocks
        };
    }
}
