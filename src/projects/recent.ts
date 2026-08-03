import type { LoadedProject } from "./model";

export const recentProjectsKey = "logicboard.recentProjects.v1";
export const projectParentKey = "logicboard.projectParent.v1";
export const recentProjectLimit = 8;

export interface RecentProject {
  rootPath: string;
  name: string;
  lastOpenedAt: number;
}

export function normalizeRecentProjects(items: RecentProject[]) {
  const seen = new Set<string>();
  return [...items]
    .filter((item) => item.rootPath.trim() && item.name.trim() && Number.isFinite(item.lastOpenedAt))
    .sort((left, right) => right.lastOpenedAt - left.lastOpenedAt)
    .filter((item) => {
      const key = item.rootPath.replace(/[\\/]+$/, "").toLocaleLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, recentProjectLimit);
}

export function loadRecentProjects(getItem: (key: string) => string | null = (key) => localStorage.getItem(key)) {
  try {
    const parsed = JSON.parse(getItem(recentProjectsKey) ?? "[]") as RecentProject[];
    return Array.isArray(parsed) ? normalizeRecentProjects(parsed) : [];
  } catch {
    return [];
  }
}

export function addRecentProject(items: RecentProject[], project: LoadedProject, now = Date.now()) {
  return normalizeRecentProjects([{ rootPath: project.rootPath, name: project.manifest.name, lastOpenedAt: now }, ...items]);
}

export function parentPath(path: string) {
  const normalized = path.replace(/[\\/]+$/, "");
  const separator = Math.max(normalized.lastIndexOf("\\"), normalized.lastIndexOf("/"));
  return separator > 0 ? normalized.slice(0, separator) : normalized;
}
