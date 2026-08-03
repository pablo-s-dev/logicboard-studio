import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { Assignment } from "../types";
import {
  closeOpenPath, isProjectDirty, loadedProjectState, projectEntityNames, projectSnapshot, reconcileTopEntity, sourceContainingEntity,
  recoverLegacyProject
} from "./model";
import type { LoadedProject, ProjectManifest, ProjectState } from "./model";

const constraintsPath = "constraints.qsf";

const initialProject = () => recoverLegacyProject((key) => localStorage.getItem(key));

export function useProjectWorkspace() {
  const [project, setProject] = useState<ProjectState>(initialProject);
  const activeIsConstraints = project.activePath === constraintsPath;
  const topSource = useMemo(
    () => sourceContainingEntity(project.sources, project.manifest.topEntity) ?? project.sources[0],
    [project.manifest.topEntity, project.sources]
  );
  const activeSource = project.sources.find((source) => source.path === project.activePath) ?? topSource;
  const entityNames = useMemo(() => projectEntityNames(project.sources), [project.sources]);
  const dirty = isProjectDirty(project);

  const setAssignments: Dispatch<SetStateAction<Assignment[]>> = (action) => {
    setProject((current) => {
      const next = typeof action === "function" ? action(current.manifest.assignments) : action;
      return { ...current, manifest: { ...current.manifest, assignments: next } };
    });
  };

  const setBoardId = (boardId: string) => setProject((current) => ({
    ...current,
    manifest: { ...current.manifest, boardId }
  }));

  const setManifest = (update: Partial<Pick<ProjectManifest, "name" | "boardId" | "topEntity">>) => setProject((current) => ({
    ...current,
    manifest: { ...current.manifest, ...update }
  }));

  const setActivePath = (path: string) => setProject((current) => ({
    ...current,
    activePath: path,
    openPaths: current.openPaths.includes(path) ? current.openPaths : [...current.openPaths, path]
  }));

  const closePath = (path: string) => setProject((current) => {
    const next = closeOpenPath(current.openPaths, current.activePath, path);
    return next.openPaths === current.openPaths ? current : { ...current, ...next };
  });

  const updateActiveContent = (content: string) => setProject((current) => {
    if (current.activePath === constraintsPath) return current;
    const sources = current.sources.map((source) => source.path === current.activePath ? { ...source, content } : source);
    return {
      ...current,
      sources,
      manifest: reconcileTopEntity(current.manifest, sources)
    };
  });

  const load = (loaded: LoadedProject) => setProject(loadedProjectState(loaded));
  const markSaved = (loaded: LoadedProject) => {
    setProject((current) => {
      if (current.legacyRecovered) {
        localStorage.removeItem("logicboard.source.v3");
        localStorage.removeItem("logicboard.assignments.v4");
      }
      const saved = loadedProjectState(loaded);
      return {
        ...saved,
        activePath: saved.sources.some((source) => source.path === current.activePath)
          ? current.activePath
          : saved.activePath,
        openPaths: current.openPaths.filter((path) => path === constraintsPath || saved.sources.some((source) => source.path === path))
      };
    });
  };

  const sourcePayloads = useMemo(
    () => project.manifest.sources.map((path) => ({ name: path, content: project.sources.find((source) => source.path === path)?.content ?? "" })),
    [project.manifest.sources, project.sources]
  );
  const sourceStateKey = useMemo(() => projectSnapshot(project.manifest, project.sources), [project.manifest, project.sources]);

  return {
    project,
    setProject,
    manifest: project.manifest,
    assignments: project.manifest.assignments,
    setAssignments,
    setBoardId,
    setManifest,
    dirty,
    activeIsConstraints,
    activeSource,
    topSource,
    entityNames,
    setActivePath,
    closePath,
    updateActiveContent,
    load,
    markSaved,
    sourcePayloads,
    sourceStateKey,
    constraintsPath
  };
}
