import { describe, expect, it } from "vitest";
import { bottomPaneLimits } from "./layout";

describe("bottom panel limits", () => {
  it("preserves the upper workspace while resizing", () => {
    expect(bottomPaneLimits(720)).toEqual([96, 495]);
  });

  it("never produces a maximum below the minimum height", () => {
    expect(bottomPaneLimits(250)).toEqual([96, 96]);
  });
});
