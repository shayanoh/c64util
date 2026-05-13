# Commodore 64 Utility (C64Util)

Using this utility you can convert games from popular formats to audio files (WAV)
so you can play them through Commodore's datassette and run the games on the real
device.

To connect the audio output of your computer to Commodore's datassette, you should
find the op-amp chip inside, and in my experience the best place would be the v+
pin of the 3rd op-amp, and the gnd pin of the same chip.

In addition, you can convert between some popular file formats.

## Supported Formats

- **Read**: T64, PRG, D64
- **Write**: T64, WAV, TAP, PRG

## Usage

```bash
c64util -i game.t64                       # Display info on input file
c64util -i game.t64 -o game.wav           # Convert to WAV
c64util -i game.t64 -o game.wav -r 44100  # Custom sample rate
c64util -i game.t64 -o game.wav -t        # Use turbo loader
c64util -i game.t64 -o game.wav -f 1      # First file only (1-based)
c64util -i game.t64 -o game.wav -f all    # All files
c64util -F                                # List supported formats
```

## Development

```bash
npm install        # Install dependencies
npm run build      # Build only
npm run start      # Run the built version
npm run dev        # Build and run
npm run clean      # Remove the dist/ folder
```

## Architecture

Extensible plugin-based design:

- `src/` - All source codes (TypeScript)
- `src/types/` - Type definitions
- `src/readers/` - Format readers
- `src/writers/` - Format writers
- `dist/` - Compiled JavaScript output
- `docs/` - Documentation for file formats

Add new formats by creating reader/writer classes inheriting from base classes.

## Resources

- TAP, T64, and more file specification acquired from: https://vice-emu.sourceforge.io/vice_17.html
- Detailed docs for file formats inside `docs/`
