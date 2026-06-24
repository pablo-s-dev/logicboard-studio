import type { BoardDefinition, BoardEndpoint } from "./types";

const make = (
  count: number,
  prefix: string,
  pins: string[],
  direction: "in" | "out",
  kind: BoardEndpoint["kind"],
  group: string,
  activeLow = false,
  visualOrder: "asc" | "desc" = "asc"
): BoardEndpoint[] =>
  Array.from({ length: count }, (_, i) => ({
    id: `${prefix}${i}`,
    label: `${prefix}${i}`,
    pin: pins[i] ?? "-",
    direction,
    kind,
    group,
    activeLow,
    displayOrder: visualOrder === "desc" ? count - 1 - i : i,
    displayLabel: `${prefix}${i}`
  }));

// Pin assignments are transcribed from the Cyclone II Starter Board manual in refs/.
export const cycloneII: BoardDefinition = {
  id: "ep2c20f484c7",
  name: "Cyclone II Starter Board",
  device: "EP2C20F484C7",
  endpoints: [
    ...make(10, "SW", ["L22", "L21", "M22", "V12", "W12", "U12", "U11", "M2", "M1", "L2"], "in", "switch", "Toggle switches", false, "desc"),
    ...make(4, "KEY", ["R22", "R21", "T22", "T21"], "in", "button", "Pushbuttons", true),
    ...make(10, "LEDR", ["R20", "R19", "U19", "Y20", "T18", "V19", "Y18", "U18", "R18", "R17"], "out", "led-red", "Red LEDs", false, "desc"),
    ...make(8, "LEDG", ["U22", "U21", "V22", "V21", "W22", "W21", "Y22", "Y21"], "out", "led-green", "Green LEDs", false, "desc"),
    ...make(4, "HEX", ["J2-G5", "L3-G1", "F1-D2", "H2-E2"], "out", "seven-segment", "Seven-segment displays"),
    { id: "CLOCK_50", label: "CLOCK_50", pin: "L1", direction: "in", kind: "clock", group: "Clocks", displayOrder: 0 },
    { id: "CLOCK_27", label: "CLOCK_27", pin: "D13", direction: "in", kind: "clock", group: "Clocks", displayOrder: 1 },
    { id: "CLOCK_24", label: "CLOCK_24", pin: "A12", direction: "in", kind: "clock", group: "Clocks", displayOrder: 2 }
  ]
};

export const boards = [cycloneII];
