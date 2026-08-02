import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import type { LoadedProject, ProjectManifest, ProjectSource, ProjectTemplate } from "./model";

export const isDesktopApp = () => "__TAURI_INTERNALS__" in window;

const requireDesktop = () => {
  if (!isDesktopApp()) throw new Error("Project folders are available only in the Tauri desktop application.");
};

export async function chooseProjectFolder() {
  requireDesktop();
  const selected = await open({ directory: true, multiple: false });
  return typeof selected === "string" ? selected : null;
}

export async function listTemplates() {
  if (!isDesktopApp()) return [];
  return invoke<ProjectTemplate[]>("list_project_templates");
}

export async function openProject(projectPath: string) {
  requireDesktop();
  return invoke<LoadedProject>("open_project", { projectPath });
}

type SavePayload = { manifest: ProjectManifest; sources: ProjectSource[] };

export async function saveProject(projectPath: string, project: SavePayload) {
  requireDesktop();
  return invoke<LoadedProject>("save_project", { projectPath, project });
}

export async function saveProjectAs(parentPath: string, folderName: string, project: SavePayload) {
  requireDesktop();
  return invoke<LoadedProject>("save_project_as", { parentPath, folderName, project });
}

export async function createProject(parentPath: string, folderName: string, templateId: string, projectName: string) {
  requireDesktop();
  return invoke<LoadedProject>("create_project", { parentPath, folderName, templateId, projectName });
}

export function projectFolderName(name: string) {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "logicboard-project";
}
