import { describe, expect, it } from "vitest";
import { uniqueProblems } from "./problems";

describe("uniqueProblems", () => {
  it("collapses the same GHDL error reported from different temporary runs", () => {
    const first = String.raw`C:\Users\Pablo\AppData\Local\Temp\logicboard-100\src\top.vhd:9:4:error: missing semicolon`;
    const second = String.raw`C:\Users\Pablo\AppData\Local\Temp\logicboard-200/src/top.vhd:9:4:error: missing semicolon`;
    expect(uniqueProblems([first, second])).toEqual([first]);
  });

  it("preserves diagnostics that point to different source errors", () => {
    expect(uniqueProblems(["src/top.vhd:9:4:error: first", "src/top.vhd:10:4:error: second"])).toHaveLength(2);
  });
});
