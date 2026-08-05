import blankManifest from "../../src-tauri/templates/blank/logicboard.project.json";
import blankSource from "../../src-tauri/templates/blank/src/logicboard_top.vhd?raw";
import ledSwitchManifest from "../../src-tauri/templates/led-switch-mirror/logicboard.project.json";
import ledSwitchSource from "../../src-tauri/templates/led-switch-mirror/src/led_switch_mirror.vhd?raw";
import buttonSevenSegmentManifest from "../../src-tauri/templates/button-seven-segment/logicboard.project.json";
import buttonSevenSegmentSource from "../../src-tauri/templates/button-seven-segment/src/button_seven_segment.vhd?raw";
import timerManifest from "../../src-tauri/templates/four-digit-timer/logicboard.project.json";
import timerSource from "../../src-tauri/templates/four-digit-timer/src/timer_top.vhd?raw";
import type { LoadedProject, ProjectManifest, ProjectSource, ProjectTemplate } from "./model";

export const browserProjectsKey = "logicboard.browserProjects.v1";
export const browserProjectPrefix = "local://";

type ProjectStorage = Pick<Storage, "getItem" | "setItem">;
type BrowserTemplate = ProjectTemplate & { manifest: ProjectManifest; sources: ProjectSource[] };
type SavePayload = { manifest: ProjectManifest; sources: ProjectSource[] };

const templates: BrowserTemplate[] = [
  template("blank", blankManifest, [{ path: "src/logicboard_top.vhd", content: blankSource }]),
  template("led-switch-mirror", ledSwitchManifest, [{ path: "src/led_switch_mirror.vhd", content: ledSwitchSource }]),
  template("button-seven-segment", buttonSevenSegmentManifest, [{ path: "src/button_seven_segment.vhd", content: buttonSevenSegmentSource }]),
  template("four-digit-timer", timerManifest, [{ path: "src/timer_top.vhd", content: timerSource }])
];

function template(id: string, manifest: unknown, sources: ProjectSource[]): BrowserTemplate {
  const typedManifest = manifest as ProjectManifest;
  return { id, name: typedManifest.name, description: "", manifest: typedManifest, sources };
}

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

function readProjects(storage: ProjectStorage): LoadedProject[] {
  const raw = storage.getItem(browserProjectsKey);
  if (!raw) return [];
  const parsed = JSON.parse(raw) as unknown;
  if (!Array.isArray(parsed)) throw new Error("The saved browser project data is invalid.");
  return parsed.filter((project): project is LoadedProject => {
    if (!project || typeof project !== "object") return false;
    const candidate = project as Partial<LoadedProject>;
    return typeof candidate.rootPath === "string"
      && isBrowserProjectPath(candidate.rootPath)
      && Boolean(candidate.manifest)
      && Array.isArray(candidate.sources);
  });
}

function writeProject(storage: ProjectStorage, project: LoadedProject) {
  const projects = readProjects(storage).filter((item) => item.rootPath !== project.rootPath);
  storage.setItem(browserProjectsKey, JSON.stringify([project, ...projects]));
  return clone(project);
}

function nextProjectPath(projects: LoadedProject[]) {
  let id: string;
  do {
    id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  } while (projects.some((project) => project.rootPath === `${browserProjectPrefix}${id}`));
  return `${browserProjectPrefix}${id}`;
}

export function isBrowserProjectPath(path: string) {
  return path.startsWith(browserProjectPrefix);
}

export function listBrowserTemplates(): ProjectTemplate[] {
  return templates.map(({ id, name, description }) => ({ id, name, description }));
}

export function createBrowserProject(projectName: string, templateId: string, storage: ProjectStorage = localStorage) {
  const selected = templates.find((item) => item.id === templateId);
  if (!selected) throw new Error(`Unknown project template: ${templateId}.`);
  const project: LoadedProject = {
    rootPath: nextProjectPath(readProjects(storage)),
    manifest: { ...clone(selected.manifest), name: projectName },
    sources: clone(selected.sources)
  };
  return writeProject(storage, project);
}

export function openBrowserProject(projectPath: string, storage: ProjectStorage = localStorage) {
  const project = readProjects(storage).find((item) => item.rootPath === projectPath);
  if (!project) throw new Error("This browser project could not be found. It may have been removed from local storage.");
  return clone(project);
}

export function saveBrowserProject(projectPath: string, payload: SavePayload, storage: ProjectStorage = localStorage) {
  if (!readProjects(storage).some((item) => item.rootPath === projectPath)) {
    throw new Error("This browser project could not be found. Save it as a new project instead.");
  }
  return writeProject(storage, { rootPath: projectPath, ...clone(payload) });
}

export function saveBrowserProjectAs(payload: SavePayload, storage: ProjectStorage = localStorage) {
  const rootPath = nextProjectPath(readProjects(storage));
  return writeProject(storage, { rootPath, ...clone(payload) });
}
