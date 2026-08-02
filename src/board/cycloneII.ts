import type { BoardDefinition, BoardEndpoint, BoardGroup, DeviceKind, Direction } from "../types";

const segmentNames = ["a", "b", "c", "d", "e", "f", "g"];
const interactiveClockHz = 1_000;

const makeBitEndpoint = (
  groupId: string,
  vectorName: string,
  bit: number,
  pin: string | undefined,
  direction: Direction,
  kind: DeviceKind,
  group: string,
  activeLow: boolean,
  displayOrder: number,
  displayLabel = `${vectorName}${bit}`
): BoardEndpoint => ({
  id: `${vectorName}${bit}`,
  label: `${vectorName}${bit}`,
  pin,
  direction,
  kind,
  group,
  groupId,
  bit,
  activeLow,
  displayOrder,
  displayLabel
});

const makeVectorGroup = (
  id: string,
  label: string,
  vectorName: string,
  pins: string[],
  direction: Direction,
  kind: DeviceKind,
  groupLabel: string,
  displayOrder: number,
  activeLow = false,
  visualOrder: "asc" | "desc" = "desc"
): BoardGroup => {
  const width = pins.length;
  const children = Array.from({ length: width }, (_, bit) =>
    makeBitEndpoint(
      id,
      vectorName,
      bit,
      pins[bit],
      direction,
      kind,
      groupLabel,
      activeLow,
      visualOrder === "desc" ? width - 1 - bit : bit
    )
  );
  return { id, label, vectorName, width, direction, kind, activeLow, displayOrder, children };
};

const makeHexGroup = (
  index: number,
  pins: Array<string | undefined>,
  displayOrder: number
): BoardGroup => {
  const id = `HEX${index}`;
  const children = segmentNames.map((segment, bit) => ({
    id: `${id}.${segment}`,
    label: `${id}[${bit}]`,
    pin: pins[bit],
    direction: "out" as const,
    kind: "seven-segment" as const,
    group: "Seven-segment displays",
    groupId: id,
    bit,
    segment,
    activeLow: true,
    displayOrder: bit,
    displayLabel: segment.toUpperCase()
  }));
  return {
    id,
    label: id,
    vectorName: id,
    width: 7,
    direction: "out",
    kind: "seven-segment",
    activeLow: true,
    displayOrder,
    children
  };
};

const makeClockGroup = (children: BoardEndpoint[]): BoardGroup => ({
  id: "CLOCKS",
  label: "Clocks",
  direction: "in",
  kind: "clock",
  displayOrder: 6,
  children
});

const groups: BoardGroup[] = [
  makeVectorGroup("SW", "Toggle switches", "SW", ["L22", "L21", "M22", "V12", "W12", "U12", "U11", "M2", "M1", "L2"], "in", "switch", "Toggle switches", 3, false, "desc"),
  makeVectorGroup("KEY", "Pushbuttons", "KEY", ["R22", "R21", "T22", "T21"], "in", "button", "Pushbuttons", 4, true, "desc"),
  makeVectorGroup("LEDR", "Red LEDs", "LEDR", ["R20", "R19", "U19", "Y20", "T18", "V19", "Y18", "U18", "R18", "R17"], "out", "led-red", "Red LEDs", 1, false, "desc"),
  makeVectorGroup("LEDG", "Green LEDs", "LEDG", ["U22", "U21", "V22", "V21", "W22", "W21", "Y22", "Y21"], "out", "led-green", "Green LEDs", 2, false, "desc"),
  makeHexGroup(0, ["J2", "J1", "H2", "H1", "F2", "F1", "E2"], 0.3),
  makeHexGroup(1, ["E1", "H6", "H5", "H4", "G3", "D2", "D1"], 0.2),
  makeHexGroup(2, ["G5", "G6", "C2", "C1", "E3", "E4", "D3"], 0.1),
  makeHexGroup(3, ["F4", "D5", "D6", "J4", "L8", "F3", "D4"], 0),
  makeClockGroup([
    { id: "CLOCK_50", label: "CLOCK_50", pin: "L1", frequencyHz: 50_000_000, simulationFrequencyHz: interactiveClockHz, direction: "in", kind: "clock", group: "Clocks", groupId: "CLOCKS", displayOrder: 0 },
    { id: "CLOCK_27", label: "CLOCK_27", pin: "D13", frequencyHz: 27_000_000, simulationFrequencyHz: interactiveClockHz, direction: "in", kind: "clock", group: "Clocks", groupId: "CLOCKS", displayOrder: 1 },
    { id: "CLOCK_24", label: "CLOCK_24", pin: "A12", frequencyHz: 24_000_000, simulationFrequencyHz: interactiveClockHz, direction: "in", kind: "clock", group: "Clocks", groupId: "CLOCKS", displayOrder: 2 }
  ])
];

export const endpointSort = (a: BoardEndpoint, b: BoardEndpoint) =>
  (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.label.localeCompare(b.label);

export const groupSort = (a: BoardGroup, b: BoardGroup) =>
  a.displayOrder - b.displayOrder || a.label.localeCompare(b.label);

export const cycloneII: BoardDefinition = {
  id: "ep2c20f484c7",
  name: "Cyclone II Starter Board",
  device: "EP2C20F484C7",
  groups,
  endpoints: groups.flatMap((group) => group.children)
};

export const boards = [cycloneII];
