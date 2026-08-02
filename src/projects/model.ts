import { boards, cycloneII } from "../board";
import { normalizeAssignments } from "../assignments/model";
import type { Assignment } from "../types";
import { parseEntityNames } from "../vhdl";

export const projectSchemaVersion = 1 as const;
export const projectManifestName = "logicboard.project.json";

export interface ProjectManifest {
  schemaVersion: typeof projectSchemaVersion;
  name: string;
  boardId: string;
  topEntity: string;
  sources: string[];
  assignments: Assignment[];
}

export interface ProjectSource {
  path: string;
  content: string;
}

export interface LoadedProject {
  rootPath: string;
  manifest: ProjectManifest;
  sources: ProjectSource[];
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
}

export interface ProjectState {
  rootPath: string | null;
  manifest: ProjectManifest;
  sources: ProjectSource[];
  activePath: string;
  savedSnapshot: string | null;
  legacyRecovered: boolean;
}

export const starterVhdl = `library ieee;
use ieee.std_logic_1164.all;

entity board_demo is
  port (
    SW       : in  std_logic_vector(9 downto 0);
    KEY      : in  std_logic_vector(3 downto 0);
    CLOCK_50 : in  std_logic;
    LEDR     : out std_logic_vector(9 downto 0);
    LEDG     : out std_logic_vector(7 downto 0)
  );
end entity;

architecture rtl of board_demo is
begin
  LEDR <= SW;
  LEDG(0) <= not KEY(0);
  LEDG(1) <= SW(0);
end architecture;
`;

export const starterAssignments: Assignment[] = [
  { id: "vector:SW:SW", kind: "vector", endpointId: "SW", portId: "SW" },
  { id: "vector:KEY:KEY", kind: "vector", endpointId: "KEY", portId: "KEY" },
  { id: "vector:LEDR:LEDR", kind: "vector", endpointId: "LEDR", portId: "LEDR" },
  { id: "vector:LEDG:LEDG", kind: "vector", endpointId: "LEDG", portId: "LEDG" },
  { id: "granular:CLOCK_50:CLOCK_50", kind: "granular", endpointId: "CLOCK_50", portId: "CLOCK_50" }
];

export function projectSnapshot(manifest: ProjectManifest, sources: ProjectSource[]) {
  return JSON.stringify({ manifest, sources });
}

export function isProjectDirty(project: ProjectState) {
  return project.savedSnapshot !== projectSnapshot(project.manifest, project.sources);
}

export function isProjectSourceDirty(project: ProjectState, path: string) {
  if (!project.savedSnapshot) return true;
  try {
    const saved = JSON.parse(project.savedSnapshot) as { sources?: ProjectSource[] };
    const previous = saved.sources?.find((source) => source.path === path);
    const current = project.sources.find((source) => source.path === path);
    return previous?.content !== current?.content;
  } catch {
    return true;
  }
}

export function loadedProjectState(project: LoadedProject): ProjectState {
  const snapshot = projectSnapshot(project.manifest, project.sources);
  return {
    ...project,
    activePath: project.sources[0]?.path ?? "",
    savedSnapshot: snapshot,
    legacyRecovered: false
  };
}

export function untitledProject(source = starterVhdl, assignments: Assignment[] = starterAssignments, recovered = false): ProjectState {
  const name = recovered ? "Recovered board-demo" : "Untitled board-demo";
  return {
    rootPath: null,
    manifest: {
      schemaVersion: projectSchemaVersion,
      name,
      boardId: cycloneII.id,
      topEntity: "board_demo",
      sources: ["src/board_demo.vhd"],
      assignments: normalizeAssignments(assignments)
    },
    sources: [{ path: "src/board_demo.vhd", content: source }],
    activePath: "src/board_demo.vhd",
    savedSnapshot: null,
    legacyRecovered: recovered
  };
}

export function recoverLegacyProject(getItem: (key: string) => string | null) {
  const storedSource = getItem("logicboard.source.v3");
  const storedAssignments = getItem("logicboard.assignments.v4");
  let assignments = starterAssignments;
  if (storedAssignments !== null) {
    try {
      assignments = normalizeAssignments(JSON.parse(storedAssignments) as Partial<Assignment>[]);
    } catch {
      assignments = starterAssignments;
    }
  }
  return untitledProject(storedSource ?? starterVhdl, assignments, storedSource !== null || storedAssignments !== null);
}

export type UnsavedDecision = "save" | "discard" | "cancel";

export function shouldContinueProjectAction(decision: UnsavedDecision, saveSucceeded = false) {
  return decision === "discard" || (decision === "save" && saveSucceeded);
}

export function projectEntityNames(sources: ProjectSource[]) {
  return Array.from(new Set(sources.flatMap((source) => parseEntityNames(source.content))));
}

export function sourceContainingEntity(sources: ProjectSource[], entityName: string) {
  const target = entityName.toLowerCase();
  return sources.find((source) => parseEntityNames(source.content).some((name) => name.toLowerCase() === target));
}

export function validateProjectManifest(manifest: ProjectManifest, sources: ProjectSource[]) {
  const problems: string[] = [];
  if (manifest.schemaVersion !== projectSchemaVersion) problems.push(`Unsupported project schema version: ${manifest.schemaVersion}.`);
  if (!manifest.name.trim()) problems.push("Project name is required.");
  if (!boards.some((board) => board.id === manifest.boardId)) problems.push(`Unknown target board: ${manifest.boardId}.`);
  if (!/^[A-Za-z_]\w*$/.test(manifest.topEntity)) problems.push(`Invalid top entity: ${manifest.topEntity}.`);
  if (!manifest.sources.length) problems.push("The project has no VHDL source files.");

  const seen = new Set<string>();
  for (const path of manifest.sources) {
    const normalized = path.toLowerCase();
    if (!/^src\/(?!.*(?:^|\/)\.\.?\/)[^\\]+\.(?:vhd|vhdl)$/i.test(path)) problems.push(`Invalid project source path: ${path}.`);
    if (seen.has(normalized)) problems.push(`Duplicate project source path: ${path}.`);
    seen.add(normalized);
    if (!sources.some((source) => source.path === path)) problems.push(`Missing loaded project source: ${path}.`);
  }

  if (!sourceContainingEntity(sources, manifest.topEntity)) problems.push(`Top entity ${manifest.topEntity} was not found in the project sources.`);
  return problems;
}

export function sourcePayloads(project: ProjectState) {
  return project.manifest.sources.map((path) => {
    const source = project.sources.find((item) => item.path === path);
    return { name: path, content: source?.content ?? "" };
  });
}
