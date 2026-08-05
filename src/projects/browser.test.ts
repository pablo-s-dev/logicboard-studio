import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserProjectsKey, createBrowserProject, listBrowserTemplates, openBrowserProject,
  saveBrowserProject, saveBrowserProjectAs
} from "./browser";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); }
  };
}

describe("browser project persistence", () => {
  beforeEach(() => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn()
      .mockReturnValueOnce("project-1")
      .mockReturnValueOnce("project-2") });
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
