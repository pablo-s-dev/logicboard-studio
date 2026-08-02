# Four-digit timer

Press Run to count from `00:00` to `59:59`. `KEY0` pauses/resumes and `KEY1` resets. The source uses a 1 kHz clock constant so interactive simulation advances visibly.

For the physical Cyclone II board, change `CLOCK_FREQ_HZ` from `1_000` to `50_000_000` before synthesis. The bundled assignment still maps `CLOCK_50` to the board's 50 MHz oscillator.
