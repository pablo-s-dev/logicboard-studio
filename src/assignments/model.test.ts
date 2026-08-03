import { describe, expect, it } from "vitest";
import { cycloneII } from "../board";
import type { Assignment, EntityPort } from "../types";
import { expandAssignments, removeAssignmentTarget } from "./model";

const swPorts: EntityPort[] = Array.from({ length: 10 }, (_, bit) => ({
  id: `SW[${bit}]`, name: "SW", bit, direction: "in", type: "std_logic_vector"
}));
const vector: Assignment = { id: "vector:SW:SW", kind: "vector", endpointId: "SW", portId: "SW" };

describe("assignment removal", () => {
  it("removes one expanded vector bit and preserves the remaining mappings", () => {
    const next = removeAssignmentTarget([vector], cycloneII, swPorts, "SW0");
    expect(next).toHaveLength(9);
    expect(next.every((assignment) => assignment.kind === "granular")).toBe(true);
    expect(expandAssignments(next, cycloneII, swPorts).map((assignment) => assignment.endpointId)).not.toContain("SW0");
  });

  it("removes the complete group when the vector group is targeted", () => {
    expect(removeAssignmentTarget([vector], cycloneII, swPorts, "SW")).toEqual([]);
  });
});
