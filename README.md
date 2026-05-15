# Commodore 64 Utility (C64Util)

Convert Commodore 64 tape and disk images to audio files for loading on real
hardware, or use the interactive play mode to select and preview programs
directly through your computer's speakers — no conversion to disk required.

Using this utility you can convert games from popular formats to audio files
(WAV) so you can play them through Commodore's datassette and run the games on
the real device.

To connect the audio output of your computer to Commodore's datassette, you
should find the op-amp chip inside, and in my experience the best place would be
the v+ pin of the 3rd op-amp, and the gnd pin of the same chip.

In addition, you can convert between some popular file formats.

## Hints

- If you are converting from D64, make sure the game is single-load, meaning it
  doesn't need to load additional files from the disk, otherwise it fails.
- If you are converting from T64, if the game is multi-load, you can convert all
  of it to a single wave file with kernal (slow) loader, but I suggest trying to
  convert the main part using turbo loader, and others using standard loader to
  another wave and playing it when required.

## Supported Formats

- **Read**: T64, PRG, D64
- **Write**: T64, WAV, TAP, PRG

## Installation

The latest version is published in NPM repository.

You can install the latest version using `npm install -g c64util` or you can use
npx and easily run with `npx c64util`.

## Usage

### Convert to Audio File

```bash
c64util -i game.t64                       # Display info on input file
c64util -i game.t64 -o game.wav           # Convert to WAV
c64util -i game.t64 -o game.wav -r 44100  # Custom sample rate
c64util -i game.t64 -o game.wav -t        # Use turbo loader
c64util -i game.t64 -o game.wav -f 1      # First file only (1-based)
c64util -i game.t64 -o game.wav -f all    # All files
```

### Interactive Play Mode

Preview and load programs directly through your speakers without writing to
disk. Select a program from an interactive TUI, toggle between Kernal and Turbo
loader, and play — all in-memory.

```bash
c64util -i game.t64 -p                    # Enter play mode
c64util -i game.t64 -p -r 44100           # Play mode with custom sample rate
```

In play mode:

- **↑/↓** — Navigate programs
- **Enter** — Select and play
- **t** — Toggle Kernal/Turbo loader
- **q** — Return to file list (from player) or quit (from list)

### Convert Between Formats

```bash
c64util -i game.t64 -o game.tap           # Convert T64 to TAP
c64util -i game.t64 -o game.prg           # Convert T64 to PRG
c64util -i game.t64 -o output.t64         # Convert to T64
c64util -F                                # List supported formats
```

## Development

To read the source code or help the development, visit
[C64Util GitHub](https://github.com/shayanoh/c64util).

```bash
pnpm install        # Install dependencies
pnpm run build      # Build only
pnpm run start      # Run the built version
pnpm run dev        # Build and run
pnpm run clean      # Remove the dist/ folder
```

## Architecture

Extensible plugin-based design:

- `src/` - All source codes (TypeScript)
- `src/types/` - Type definitions
- `src/readers/` - Format readers
- `src/writers/` - Format writers
- `src/player/` - Interactive play mode TUI
- `src/base/` - Abstract base classes and factories
- `c64turbo/` - A turbo loader with graphics screen, written in commodore 64
  assembly
- `assets/` - Assembled turbo loader and graphics screen, for use in
  `c64util -t`
- `dist/` - Compiled JavaScript output
- `docs/` - Documentation for file formats

Add new formats by creating reader/writer classes inheriting from base classes.

## Resources

- TAP, T64, and more file specification acquired from:
  https://vice-emu.sourceforge.io/vice_17.html
- Detailed docs for file formats inside `docs/`
