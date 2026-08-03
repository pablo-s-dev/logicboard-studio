import { describe, expect, it } from "vitest";
import {
  closeOpenPath, isProjectDirty, loadedProjectState, projectEntityNames, reconcileTopEntity, recoverLegacyProject,
  shouldContinueProjectAction, sourceContainingEntity, sourcePayloads, untitledProject
} from "./model";
import type { LoadedProject, ProjectState } from "./model";

const loaded: LoadedProject = {
  rootPath: "C:/projects/demo",
  manifest: {
    schemaVersion: 1,
    name: "Demo",
    boardId: "ep2c20f484c7",
    topEntity: "top",
    sources: ["src/package.vhd", "src/top.vhd"],
    assignments: []
  },
  sources: [
    { path: "src/package.vhd", content: "package helpers is end package;" },
    { path: "src/top.vhd", content: "entity top is port ( led : out bit ); end entity;" }
  ]
};

describe("desktop project state", () => {
  it("derives dirty state from source and manifest baselines", () => {
    const state = loadedProjectState(loaded);
    expect(isProjectDirty(state)).toBe(false);
    const changed: ProjectState = { ...state, manifest: { ...state.manifest, name: "Changed" } };
    expect(isProjectDirty(changed)).toBe(true);
  });

  it("preserves manifest order in backend source payloads", () => {
    const state = loadedProjectState(loaded);
    state.sources.reverse();
    expect(sourcePayloads(state).map((source) => source.name)).toEqual(["src/package.vhd", "src/top.vhd"]);
  });

  it("finds entities across files and selects the configured top source", () => {
    expect(projectEntityNames(loaded.sources)).toEqual(["top"]);
    expect(sourceContainingEntity(loaded.sources, "TOP")?.path).toBe("src/top.vhd");
  });

  it("recovers legacy source and assignments as an unsaved draft", () => {
    const values: Record<string, string> = {
      "logicboard.source.v3": "entity recovered is end entity;",
      "logicboard.assignments.v4": JSON.stringify([{ id: "vector:SW:SW", kind: "vector", endpointId: "SW", portId: "SW" }])
    };
    const state = recoverLegacyProject((key) => values[key] ?? null);
    expect(state.legacyRecovered).toBe(true);
    expect(state.savedSnapshot).toBeNull();
    expect(state.manifest.name).toBe("Recovered board-demo");
    expect(state.sources[0].content).toContain("recovered");
  });

  it("continues only after discard or a successful save", () => {
    expect(shouldContinueProjectAction("discard")).toBe(true);
    expect(shouldContinueProjectAction("save", true)).toBe(true);
    expect(shouldContinueProjectAction("save", false)).toBe(false);
    expect(shouldContinueProjectAction("cancel")).toBe(false);
  });

  it("treats the untouched starter as clean while preserving recovered drafts", () => {
    expect(isProjectDirty(untitledProject())).toBe(false);
    expect(isProjectDirty(untitledProject("entity recovered is end entity;", [], true))).toBe(true);
  });

  it("closes only the editor view and selects the neighboring tab", () => {
    expect(closeOpenPath(["a", "b", "c"], "b", "b")).toEqual({ openPaths: ["a", "c"], activePath: "c" });
    expect(closeOpenPath(["a"], "a", "a")).toEqual({ openPaths: [], activePath: "" });
  });

  it("selects the only detected entity when the configured top disappears", () => {
    const manifest = { ...loaded.manifest, topEntity: "missing" };
    expect(reconcileTopEntity(manifest, loaded.sources).topEntity).toBe("top");
    const multiple = [...loaded.sources, { path: "src/other.vhd", content: "entity other is end entity;" }];
    expect(reconcileTopEntity(manifest, multiple)).toBe(manifest);
  });
});
