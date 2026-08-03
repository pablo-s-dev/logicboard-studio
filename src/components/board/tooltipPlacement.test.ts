import { describe, expect, it } from "vitest";
import { placeTooltip } from "./tooltipPlacement";

describe("board tooltip placement", () => {
  const viewport = { width: 800, height: 600 };
  const tooltip = { width: 200, height: 80 };

  it("prefers the bottom-right of the pointer", () => {
    expect(placeTooltip({ x: 100, y: 100 }, tooltip, viewport)).toEqual({ x: 112, y: 112 });
  });

  it("flips at the right and bottom edges", () => {
    expect(placeTooltip({ x: 790, y: 590 }, tooltip, viewport)).toEqual({ x: 578, y: 498 });
  });

  it("clamps every corner and narrow viewports to an eight pixel margin", () => {
    expect(placeTooltip({ x: 0, y: 0 }, tooltip, viewport)).toEqual({ x: 12, y: 12 });
    expect(placeTooltip({ x: 20, y: 20 }, { width: 500, height: 300 }, { width: 240, height: 180 })).toEqual({ x: 8, y: 8 });
  });
});
