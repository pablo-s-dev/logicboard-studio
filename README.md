# LogicBoard Studio

An interactive VHDL workspace for the Cyclone II `EP2C20F484C7` starter board.

## Development

```powershell
npm install
npm run dev
```

The browser build includes a preview evaluator for simple concurrent assignments. The Tauri desktop build invokes GHDL for VHDL-2008 project analysis. Place the Windows GHDL distribution under `src-tauri/resources/ghdl` for packaged builds, or install `ghdl` on `PATH` while developing.

```powershell
npm run tauri dev
```

## Current board support

- 10 toggle switches
- 4 active-low pushbuttons
- 10 red and 8 green LEDs
- 4 seven-segment displays
- 50 MHz, 27 MHz, and 24 MHz clocks

Right-click a board device to assign a compatible top-level entity port.
