import { describe, expect, it } from "vitest";
import { toggleActivityView } from "./activity";

describe("activity bar", () => {
  it("closes the active sidebar when its button is selected again", () => {
    expect(toggleActivityView("explorer", "explorer")).toBeNull();
    expect(toggleActivityView("projects", "projects")).toBeNull();
    expect(toggleActivityView("credits", "credits")).toBeNull();
  });

  it("switches directly between sidebar views", () => {
    expect(toggleActivityView("explorer", "projects")).toBe("projects");
    expect(toggleActivityView(null, "credits")).toBe("credits");
  });
});
