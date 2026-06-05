# C64 Machine Code Custom Turbo Loader

This is a custom turbo loader that is used when creating TAPs or WAVs with
turbo.

To edit you can use any 6502 editor, or C64Studio to open the solution in this
directory. Sources are in [64tass](https://tass64.sourceforge.net/) compatible
format and can be assembled with 64tass using `npm run buildasm` from the repo
root (requires `64tass` on `PATH`). Listing files (`.lst`) are written next to
each `.asm` file.

## File Details

Due to lack of memory in C64 and the need to put code in tightly managed spaces
the code is split into two parts.

1. **loader_header**: This will be stored in tape header extra space that C64
   uses and will automatically load when C64 loads the file name from tape.
2. **loader**: This will be stored as data, to be loaded to $2a7 by C64 Kernal
   loader.
3. **loading.graphicscreen**: This is the turbo loader graphic screen.

## Development instructions

When developing you can change the `getLoaderCode()` in
`src/writers/tapePulseGeneratorTurbo.ts` to read the `.prg` files from this
folder. When development is done, run `npm run buildasm` to copy built `.prg`
files to `assets/` and change back the `getLoaderCode()` to normal.

The `loading.graphicscreen` file can also be edited with C64Studio, and the
resulting `loading.bin` file should also be in `assets/` directory.

# C64 Image Viewer

This is a custom image viewer that can rapidly display two different images,
therefor emulating a 256 color palette in c64.

## Development instructions

When developing you can change the `getViewerCode()` in `src/readers/image.ts`
to read the `.prg` files from this folder. When development is done, run
`npm run buildasm` and change back the `getViewerCode()` to normal.
