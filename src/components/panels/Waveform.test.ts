import { describe, expect, it } from "vitest";
import type { ExpandedAssignment, WaveSample } from "../../types";
import { countLogicalLevels, formatSampleTime } from "./Waveform";

const row = (endpointId: string): ExpandedAssignment => ({
  assignmentId: endpointId, kind: "granular", endpointId, endpointLabel: endpointId,
  portId: endpointId, portName: endpointId, direction: "out"
});

describe("waveform logical levels", () => {
  it("formats timed samples consistently in milliseconds", () => {
    expect(formatSampleTime(38_343_400_000)).toMatch(/^38[.,]343[.,]4 ms$/);
  });

  it("counts every displayed signal exactly once", () => {
    const rows = [row("A"), row("B"), row("C")];
    const sample: WaveSample = { time: 0, values: { A: false, B: true, C: false } };
    expect(countLogicalLevels(rows, sample)).toEqual({ low: 2, high: 1 });
  });
});
