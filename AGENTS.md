# AGENTS.md

## Commands

- `pnpm install` — install deps (uses pnpm, not npm)
- `pnpm run build` — compile TypeScript to `dist/`
- `pnpm run start` — run built output
- `pnpm run dev` — build + run in one step
- `pnpm run clean` — remove `dist/`
- `pnpx prettier -w <file>` — format code (required after every edit)

No test framework, no lint script, no CI.

## Architecture

Single-package CLI tool (`c64util`). Entry point: `src/index.ts` (shebang, ESM).

Plugin-based reader/writer pattern:
- `src/base/reader.ts` — abstract `Reader` class
- `src/base/readerFactory.ts` — selects reader by file extension
- `src/base/writer.ts` — abstract `Writer` class with buffered I/O + progress bar
- `src/base/writerFactory.ts` — selects writer by output extension
- `src/readers/` — T64, PRG, D64 readers
- `src/writers/` — T64, TAP, WAV, PRG writers (+ pulse generators for kernal/turbo)
- `src/types/index.ts` — shared types (`C64Info`, `C64FileInfo`)

To add a format: create a reader/writer extending the base class, register in the corresponding factory.

## Toolchain

- TypeScript 6.x, strict mode, target ES2022, module Node16
- ESM (`"type": "module"` in package.json) — all imports need `.js` extension
- Node 24 (`v24.15.0` in `.nvmrc`)
- Prettier: 4-space tabs, 80-char width, single quotes, trailing comma none
- Build output goes to `dist/` (gitignored)

## Key Conventions

- Always run `prettier -w` after editing any file
- Import paths must include `.js` extension (ESM + Node16 module resolution)
- `chmod +x dist/index.js` is part of the build step (shebang CLI)
- Always validate parameters in functions and throw an error if invalid.
