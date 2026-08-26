import { invoke } from "@tauri-apps/api/core";
import { message, open } from "@tauri-apps/plugin-dialog";
import type { LoadedProject, ProjectManifest, ProjectSource, ProjectTemplate, ProjectWorkspaceDefaults } from "./model";
import { displayProjectPath } from "./recent";
import {
  createBrowserProject, isBrowserProjectPath, listBrowserTemplates, openBrowserProject,
  saveBrowserProject, saveBrowserProjectAs
} from "./browser";

export const isDesktopApp = () => typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const requireDesktop = () => {
  if (!isDesktopApp()) throw new Error("Project folders are available only in the Tauri desktop application.");
};

export async function chooseProjectFolder(defaultPath?: string) {
  requireDesktop();
  const selected = await open({ directory: true, multiple: false, defaultPath });
  return typeof selected === "string" ? selected : null;
}

export async function resolveProjectParent(preferredPath?: string) {
  requireDesktop();
  const resolved = await invoke<ProjectWorkspaceDefaults>("resolve_project_parent", { preferredPath });
  return { ...resolved, parentPath: displayProjectPath(resolved.parentPath) };
}

export async function showProjectError(error: unknown, title = "LogicBoard project error") {
  if (!isDesktopApp()) return;
  await message(String(error), { title, kind: "error" });
}

export async function listTemplates() {
  if (!isDesktopApp()) return listBrowserTemplates();
  return invoke<ProjectTemplate[]>("list_project_templates");
}

export async function openProject(projectPath: string) {
  if (!isDesktopApp()) return openBrowserProject(projectPath);
  requireDesktop();
  return invoke<LoadedProject>("open_project", { projectPath });
}

type SavePayload = { manifest: ProjectManifest; sources: ProjectSource[] };

export async function saveProject(projectPath: string, project: SavePayload) {
  if (!isDesktopApp() && isBrowserProjectPath(projectPath)) return saveBrowserProject(projectPath, project);
  requireDesktop();
  return invoke<LoadedProject>("save_project", { projectPath, project });
}

export async function saveProjectAs(parentPath: string, folderName: string, project: SavePayload) {
  if (!isDesktopApp()) return saveBrowserProjectAs(project);
  requireDesktop();
  return invoke<LoadedProject>("save_project_as", { parentPath, folderName, project });
}

export async function createProject(parentPath: string, templateId: string, projectName: string) {
  if (!isDesktopApp()) return createBrowserProject(projectName, templateId);
  requireDesktop();
  const folderName = projectFolderName(projectName);
  return invoke<LoadedProject>("create_project", { parentPath, folderName, templateId, projectName });
}

export function projectFolderName(name: string) {
  const normalized = name.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "logicboard-project";
}
