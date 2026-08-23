import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserProjectsKey, createBrowserProject, listBrowserTemplates, openBrowserProject,
  saveBrowserProject, saveBrowserProjectAs
} from "./browser";
import { sourceContainingEntity, validateProjectManifest } from "./model";
import { expandAssignments, validateAssignments } from "../assignments/model";
import { cycloneII } from "../board";
import { parseEntityPorts } from "../vhdl";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}

describe("browser project persistence", () => {
  beforeEach(() => {
    let nextProjectId = 0;
    vi.stubGlobal("crypto", { randomUUID: vi.fn(() => `project-${++nextProjectId}`) });
  });

  it("exposes every bundled template and creates an independent saved project", () => {
    const storage = memoryStorage();
    expect(listBrowserTemplates().map((item) => item.id)).toEqual([
      "blank", "led-switch-mirror", "button-seven-segment", "four-digit-timer"
    ]);

    const created = createBrowserProject("Web demo", "led-switch-mirror", storage);
    expect(created.rootPath).toBe("local://project-1");
    expect(created.manifest.name).toBe("Web demo");
    expect(openBrowserProject(created.rootPath, storage)).toEqual(created);
    expect(JSON.parse(storage.getItem(browserProjectsKey) ?? "[]")).toHaveLength(1);
  });

  it("keeps every bundled template structurally valid and fully mapped", () => {
    const storage = memoryStorage();
    const expectations = [
      { id: "blank", ports: 0, assignments: 0, mappedPins: 0 },
      { id: "led-switch-mirror", ports: 20, assignments: 2, mappedPins: 20 },
      { id: "button-seven-segment", ports: 19, assignments: 3, mappedPins: 19 },
      { id: "four-digit-timer", ports: 41, assignments: 7, mappedPins: 41 }
    ];

    for (const expected of expectations) {
      const project = createBrowserProject(`Audit ${expected.id}`, expected.id, storage);
      expect(validateProjectManifest(project.manifest, project.sources), expected.id).toEqual([]);

      const topSource = sourceContainingEntity(project.sources, project.manifest.topEntity);
      expect(topSource, expected.id).toBeDefined();
      const ports = parseEntityPorts(topSource!.content);
      expect(ports, expected.id).toHaveLength(expected.ports);
      expect(project.manifest.assignments, expected.id).toHaveLength(expected.assignments);
      expect(expandAssignments(project.manifest.assignments, cycloneII, ports), expected.id).toHaveLength(expected.mappedPins);
      expect(validateAssignments(project.manifest.assignments, cycloneII, ports), expected.id).toEqual([]);
    }

    const blank = createBrowserProject("Blank audit", "blank", memoryStorage());
    const blankSource = sourceContainingEntity(blank.sources, blank.manifest.topEntity)!.content;
    expect(blankSource).not.toMatch(/\bport\s*\(/i);
    expect(blankSource).not.toContain("<=");
  });

  it("updates an existing project and saves a copy under a new local id", () => {
    const storage = memoryStorage();
    const created = createBrowserProject("Original", "blank", storage);
    const changed = { manifest: { ...created.manifest, name: "Changed" }, sources: created.sources };

    expect(saveBrowserProject(created.rootPath, changed, storage).manifest.name).toBe("Changed");
    const copy = saveBrowserProjectAs(changed, storage);
    expect(copy.rootPath).toBe("local://project-2");
    expect(openBrowserProject(created.rootPath, storage).manifest.name).toBe("Changed");
    expect(JSON.parse(storage.getItem(browserProjectsKey) ?? "[]")).toHaveLength(2);
  });

  it("reports missing and malformed browser projects", () => {
    const storage = memoryStorage();
    expect(() => openBrowserProject("local://missing", storage)).toThrow("could not be found");
    storage.setItem(browserProjectsKey, "{}");
    expect(() => openBrowserProject("local://missing", storage)).toThrow("data is invalid");
  });
});
