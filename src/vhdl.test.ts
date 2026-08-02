import { describe, expect, it } from "vitest";
import { cycloneII } from "./board";
import { expandAssignments, generateQsf, validateAssignments } from "./assignments/model";
import { buildSimulationClocks, clockHalfPeriodPs, simulatedTimeForWallClock } from "./simulation";
import type { Assignment } from "./types";
import { parseEntityName, parseEntityPorts, previewOutputs } from "./vhdl";
import timerTopSource from "./fixtures/timer_top.vhd?raw";

const source = `entity top is port (SW : in std_logic_vector(1 downto 0); LED : out std_logic_vector(1 downto 0)); end; architecture rtl of top is begin LED <= SW; end;`;

const timerTopAssignments: Assignment[] = [
  { id: "granular:CLOCK_50:CLOCK_50", kind: "granular", endpointId: "CLOCK_50", portId: "CLOCK_50" },
  { id: "granular:KEY0:run_btn_n", kind: "granular", endpointId: "KEY0", portId: "run_btn_n" },
  { id: "granular:KEY1:reset_btn_n", kind: "granular", endpointId: "KEY1", portId: "reset_btn_n" },
  { id: "granular:KEY2:mode_btn_n", kind: "granular", endpointId: "KEY2", portId: "mode_btn_n" },
  { id: "granular:KEY3:increment_btn_n", kind: "granular", endpointId: "KEY3", portId: "increment_btn_n" },
  { id: "granular:SW0:count_down", kind: "granular", endpointId: "SW0", portId: "count_down" },
  { id: "vector:HEX0:HEX0", kind: "vector", endpointId: "HEX0", portId: "HEX0" },
  { id: "vector:HEX1:HEX1", kind: "vector", endpointId: "HEX1", portId: "HEX1" },
  { id: "vector:HEX2:HEX2", kind: "vector", endpointId: "HEX2", portId: "HEX2" },
  { id: "vector:HEX3:HEX3", kind: "vector", endpointId: "HEX3", portId: "HEX3" },
  { id: "vector:LEDG:LEDG", kind: "vector", endpointId: "LEDG", portId: "LEDG" },
  { id: "vector:LEDR:LEDR", kind: "vector", endpointId: "LEDR", portId: "LEDR" }
];

describe("VHDL project model", () => {
  it("finds the top entity name", () => expect(parseEntityName(source)).toBe("top"));
  it("expands vector entity ports", () => expect(parseEntityPorts(source).map((p) => p.id)).toEqual(["SW[1]", "SW[0]", "LED[1]", "LED[0]"]));
  it("previews direct concurrent assignments", () => {
    const ports = parseEntityPorts(source);
    expect(previewOutputs(source, { "SW[0]": true, "SW[1]": false }, ports)["LED[0]"]).toBe(true);
  });
  it("settles chained assignments regardless of source order", () => {
    const chained = `entity top is port (SW : in std_logic; LED : out std_logic); end;
      architecture rtl of top is signal middle : std_logic; begin LED <= middle; middle <= SW; end;`;
    const ports = parseEntityPorts(chained);
    expect(previewOutputs(chained, { SW: true }, ports).LED).toBe(true);
  });
  it("previews logic literals", () => {
    const literal = `entity top is port (LED : out std_logic); end; architecture rtl of top is begin LED <= '1'; end;`;
    const ports = parseEntityPorts(literal);
    expect(previewOutputs(literal, {}, ports).LED).toBe(true);
  });
  it("parses the posted timer_top ports without legacy SW or KEY vectors", () => {
    expect(parseEntityName(timerTopSource)).toBe("timer_top");
    const ports = parseEntityPorts(timerTopSource);
    expect(ports.some((port) => port.name === "SW" || port.name === "KEY")).toBe(false);
    expect(ports.map((port) => port.id)).toContain("run_btn_n");
    expect(ports.map((port) => port.id)).toContain("increment_btn_n");
    expect(ports.map((port) => port.id)).toContain("HEX3[3]");
    expect(ports.map((port) => port.id)).toContain("LEDR[9]");
  });
  it("parses entity ports after a generic block", () => {
    const genericTimer = `entity timer_top is
      generic (CLOCK_FREQ_HZ : positive := 1_000);
      port (CLOCK_50 : in std_logic; HEX0 : out std_logic_vector(6 downto 0));
    end entity;`;
    expect(parseEntityPorts(genericTimer).map((port) => port.id)).toEqual([
      "CLOCK_50", "HEX0[6]", "HEX0[5]", "HEX0[4]", "HEX0[3]", "HEX0[2]", "HEX0[1]", "HEX0[0]"
    ]);
  });

  it("keeps the original timer clock constant visible for the simulation warning", () => {
    expect(timerTopSource).toContain("constant CLOCK_FREQ_HZ                : natural := 50_000_000;");
  });
});

describe("board assignments", () => {
  it("parses seven-segment vector ports", () => {
    const ports = parseEntityPorts(`entity timer_top is port (HEX0 : out std_logic_vector(6 downto 0)); end;`);
    expect(ports.map((port) => port.id)).toEqual(["HEX0[6]", "HEX0[5]", "HEX0[4]", "HEX0[3]", "HEX0[2]", "HEX0[1]", "HEX0[0]"]);
  });

  it("expands vector assignments into physical pins", () => {
    const ports = parseEntityPorts(`entity top is port (LEDR : out std_logic_vector(9 downto 0)); end;`);
    const assignments: Assignment[] = [{ id: "vector:LEDR:LEDR", kind: "vector", endpointId: "LEDR", portId: "LEDR" }];
    const expanded = expandAssignments(assignments, cycloneII, ports);
    expect(expanded).toHaveLength(10);
    expect(expanded.find((assignment) => assignment.endpointId === "LEDR9")?.portId).toBe("LEDR[9]");
    expect(expanded.find((assignment) => assignment.endpointId === "LEDR0")?.pin).toBe("R20");
  });

  it("supports granular seven-segment assignments", () => {
    const ports = parseEntityPorts(`entity top is port (HEX0 : out std_logic_vector(6 downto 0)); end;`);
    const assignments: Assignment[] = [{ id: "granular:HEX0.a:HEX0[0]", kind: "granular", endpointId: "HEX0.a", portId: "HEX0[0]" }];
    const expanded = expandAssignments(assignments, cycloneII, ports);
    expect(expanded).toMatchObject([{ endpointId: "HEX0.a", portId: "HEX0[0]", endpointLabel: "HEX0[0]" }]);
  });

  it("has physical pin assignments for HEX3 segments", () => {
    const ports = parseEntityPorts(`entity top is port (HEX3 : out std_logic_vector(6 downto 0)); end;`);
    const assignments: Assignment[] = [{ id: "granular:HEX3.d:HEX3[3]", kind: "granular", endpointId: "HEX3.d", portId: "HEX3[3]" }];
    const expanded = expandAssignments(assignments, cycloneII, ports);
    expect(expanded).toMatchObject([{ endpointId: "HEX3.d", portId: "HEX3[3]", pin: "J4" }]);
    expect(validateAssignments(assignments, cycloneII, ports).some((problem) => problem.includes("physical FPGA pin"))).toBe(false);
  });

  it("shows seven-segment displays in board order from HEX3 to HEX0", () => {
    expect(cycloneII.groups
      .filter((group) => group.kind === "seven-segment")
      .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label))
      .map((group) => group.id)
    ).toEqual(["HEX3", "HEX2", "HEX1", "HEX0"]);
  });

  it("keeps hardware clock frequencies separate from interactive simulation clocks", () => {
    const clock50 = cycloneII.endpoints.find((endpoint) => endpoint.id === "CLOCK_50");
    const clock27 = cycloneII.endpoints.find((endpoint) => endpoint.id === "CLOCK_27");
    const clock24 = cycloneII.endpoints.find((endpoint) => endpoint.id === "CLOCK_24");
    expect(clock50).toMatchObject({ frequencyHz: 50_000_000, simulationFrequencyHz: 1_000 });
    expect(clock27).toMatchObject({ frequencyHz: 27_000_000, simulationFrequencyHz: 1_000 });
    expect(clock24).toMatchObject({ frequencyHz: 24_000_000, simulationFrequencyHz: 1_000 });
  });

  it("builds interactive simulation clocks from mapped board clocks", () => {
    const ports = parseEntityPorts(`entity top is port (CLOCK_50 : in std_logic); end;`);
    const assignments: Assignment[] = [{ id: "granular:CLOCK_50:CLOCK_50", kind: "granular", endpointId: "CLOCK_50", portId: "CLOCK_50" }];
    const expanded = expandAssignments(assignments, cycloneII, ports);
    expect(buildSimulationClocks(expanded, cycloneII.endpoints)).toMatchObject([{
      portId: "CLOCK_50",
      frequencyHz: 50_000_000,
      simulationFrequencyHz: 1_000,
      halfPeriodPs: 500_000_000
    }]);
    expect(clockHalfPeriodPs(1_000)).toBe(500_000_000);
  });

  it("derives simulated time from wall-clock time and speed", () => {
    expect(simulatedTimeForWallClock(250, 100, 20_000_000, 1)).toBe(170_000_000);
    expect(simulatedTimeForWallClock(250, 100, 20_000_000, 2)).toBe(320_000_000);
  });

  it("ignores stale vector assignments from a previous VHDL source", () => {
    const ports = parseEntityPorts(timerTopSource);
    const staleAssignments: Assignment[] = [
      { id: "vector:SW:SW", kind: "vector", endpointId: "SW", portId: "SW" },
      { id: "vector:KEY:KEY", kind: "vector", endpointId: "KEY", portId: "KEY" },
      { id: "vector:LEDG:LEDG", kind: "vector", endpointId: "LEDG", portId: "LEDG" },
      { id: "vector:LEDR:LEDR", kind: "vector", endpointId: "LEDR", portId: "LEDR" },
      { id: "granular:CLOCK_50:CLOCK_50", kind: "granular", endpointId: "CLOCK_50", portId: "CLOCK_50" }
    ];
    const diagnostics = validateAssignments(staleAssignments, cycloneII, ports).join("\n");
    expect(diagnostics).not.toContain("Unknown vector port SW");
    expect(diagnostics).not.toContain("Unknown vector port KEY");
    expect(diagnostics).not.toContain("Toggle switches is partially mapped");
  });

  it("maps the real timer_top fixture without stale SW or KEY problems", () => {
    const ports = parseEntityPorts(timerTopSource);
    const expanded = expandAssignments(timerTopAssignments, cycloneII, ports);
    const diagnostics = validateAssignments(timerTopAssignments, cycloneII, ports).join("\n");

    expect(expanded.find((assignment) => assignment.endpointId === "CLOCK_50")).toMatchObject({ portId: "CLOCK_50", pin: "L1" });
    expect(expanded.find((assignment) => assignment.endpointId === "KEY0")).toMatchObject({ portId: "run_btn_n", pin: "R22" });
    expect(expanded.find((assignment) => assignment.endpointId === "KEY1")).toMatchObject({ portId: "reset_btn_n", pin: "R21" });
    expect(expanded.find((assignment) => assignment.endpointId === "KEY2")).toMatchObject({ portId: "mode_btn_n", pin: "T22" });
    expect(expanded.find((assignment) => assignment.endpointId === "KEY3")).toMatchObject({ portId: "increment_btn_n", pin: "T21" });
    expect(expanded.find((assignment) => assignment.endpointId === "SW0")).toMatchObject({ portId: "count_down", pin: "L22" });
    expect(expanded.find((assignment) => assignment.endpointId === "HEX3.d")).toMatchObject({ portId: "HEX3[3]", pin: "J4" });
    expect(expanded.find((assignment) => assignment.endpointId === "LEDG7")).toMatchObject({ portId: "LEDG[7]", pin: "Y21" });
    expect(expanded.find((assignment) => assignment.endpointId === "LEDR9")).toMatchObject({ portId: "LEDR[9]", pin: "R17" });
    expect(diagnostics).not.toContain("Unknown vector port SW");
    expect(diagnostics).not.toContain("Unknown vector port KEY");
    expect(diagnostics).not.toContain("has no Quartus pin assignment");
  });

  it("warns about unmapped outputs", () => {
    const ports = parseEntityPorts(`entity top is port (LEDG : out std_logic_vector(1 downto 0)); end;`);
    expect(validateAssignments([], cycloneII, ports)).toContain("Output LEDG[0] has no Quartus pin assignment.");
  });

  it("generates Quartus pin assignments", () => {
    const ports = parseEntityPorts(`entity top is port (LEDR : out std_logic_vector(1 downto 0)); end;`);
    const assignments: Assignment[] = [
      { id: "granular:LEDR0:LEDR[0]", kind: "granular", endpointId: "LEDR0", portId: "LEDR[0]" },
      { id: "granular:LEDR1:LEDR[1]", kind: "granular", endpointId: "LEDR1", portId: "LEDR[1]" }
    ];
    expect(generateQsf(assignments, cycloneII, ports, "top")).toContain("set_location_assignment PIN_R20 -to LEDR[0]");
  });
});
