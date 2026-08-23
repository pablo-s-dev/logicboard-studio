import { describe, expect, it } from "vitest";
import { projectPopoverPosition } from "./projectPopover";

describe("projectPopoverPosition", () => {
  it("right-aligns the actions menu without crossing the viewport edge", () => {
    expect(projectPopoverPosition({
      anchorLeft: 638,
      anchorRight: 669,
      anchorBottom: 43,
      viewportWidth: 677,
      viewportHeight: 709,
      preferredWidth: 260,
      alignment: "right"
    })).toEqual({ left: 409, top: 47, width: 260, maxHeight: 654 });
  });

  it("clamps a left-aligned switcher to the available viewport width", () => {
    expect(projectPopoverPosition({
      anchorLeft: 250,
      anchorRight: 427,
      anchorBottom: 43,
      viewportWidth: 320,
      viewportHeight: 480,
      preferredWidth: 390,
      alignment: "left"
    })).toEqual({ left: 8, top: 47, width: 304, maxHeight: 425 });
  });
});
