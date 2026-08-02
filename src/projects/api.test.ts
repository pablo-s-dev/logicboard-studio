import { beforeEach, describe, expect, it, vi } from "vitest";

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock("@tauri-apps/api/core", () => ({ invoke }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ message: vi.fn(), open: vi.fn() }));

import { saveProject } from "./api";

const project = {
  manifest: {
    schemaVersion: 1 as const,
    name: "Demo",
    boardId: "ep2c20f484c7",
    topEntity: "top",
    sources: ["src/top.vhd"],
    assignments: []
  },
  sources: [{ path: "src/top.vhd", content: "entity top is end entity;" }]
};

describe("native project API", () => {
  beforeEach(() => {
    invoke.mockReset();
    vi.stubGlobal("window", { __TAURI_INTERNALS__: {} });
  });

  it("returns the saved project after a successful native save", async () => {
    invoke.mockResolvedValue({ rootPath: "C:/demo", ...project });
    await expect(saveProject("C:/demo", project)).resolves.toMatchObject({ rootPath: "C:/demo" });
    expect(invoke).toHaveBeenCalledWith("save_project", { projectPath: "C:/demo", project });
  });

  it("propagates native save failures", async () => {
    invoke.mockRejectedValue(new Error("disk full"));
    await expect(saveProject("C:/demo", project)).rejects.toThrow("disk full");
  });
});
