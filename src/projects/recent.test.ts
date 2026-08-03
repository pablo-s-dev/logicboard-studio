import { describe, expect, it } from "vitest";
import { addRecentProject, displayProjectPath, normalizeRecentProjects, recentProjectLimit } from "./recent";

describe("recent desktop projects", () => {
  it("sorts, deduplicates Windows paths and keeps eight entries", () => {
    const values = Array.from({ length: 10 }, (_, index) => ({ rootPath: `C:\\Projects\\P${index}`, name: `P${index}`, lastOpenedAt: index }));
    values.push({ rootPath: "c:\\projects\\p9", name: "duplicate", lastOpenedAt: 20 });
    const normalized = normalizeRecentProjects(values);
    expect(normalized).toHaveLength(recentProjectLimit);
    expect(normalized[0].name).toBe("duplicate");
    expect(normalized.filter((item) => item.rootPath.toLowerCase() === "c:\\projects\\p9")).toHaveLength(1);
  });

  it("records a successfully loaded project", () => {
    const recent = addRecentProject([], {
      rootPath: "C:\\Projects\\Demo",
      manifest: { schemaVersion: 1, name: "Demo", boardId: "ep2c20f484c7", topEntity: "top", sources: ["src/top.vhd"], assignments: [] },
      sources: [{ path: "src/top.vhd", content: "entity top is end entity;" }]
    }, 123);
    expect(recent[0]).toEqual({ rootPath: "C:\\Projects\\Demo", name: "Demo", lastOpenedAt: 123 });
  });

  it("removes Windows verbatim prefixes from paths shown in the interface", () => {
    expect(displayProjectPath("\\\\?\\C:\\Users\\Pablo\\Documents")).toBe("C:\\Users\\Pablo\\Documents");
    expect(displayProjectPath("\\\\?\\UNC\\server\\projects")).toBe("\\\\server\\projects");
  });
});
