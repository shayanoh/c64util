# C64 Machine Code Custom Turbo Loader

This is a custom turbo loader that is used when creating TAPs or WAVs with turbo.

To edit you can use C64Studio to open the solution in this directory.

## File Details

Due to lack of memory in C64 and the need to put code in tightly managed spaces
the code is split into two parts.

1. **loader_header**: This will be stored in tape header extra space that C64 uses and
   will automatically load when C64 loads the file name from tape.
2. **loader**: This will be stored as data, to be loaded to $2a7 by C64 Kernal loader.
