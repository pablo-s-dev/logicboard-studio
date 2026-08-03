import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Activity, ChevronDown, CircleStop, Cpu, FileCode2, FolderKanban, FolderOpen, Gauge,
  Info, MoreHorizontal, Play, RotateCcw, Save, Search, Settings2, TerminalSquare, Unplug
} from "lucide-react";
import { boards, cycloneII } from "./board";
import {
  applyAssignment, expandAssignments, generateQsf, removeAssignmentTarget, validateAssignments
} from "./assignments/model";
import { NewProjectDialog, ProjectHub, ProjectMenu, ProjectSettingsDialog, ProjectSwitcher, ProjectWelcome, RemoveAssignmentDialog, UnsavedChangesDialog } from "./components/projects/ProjectControls";
import { ApplicationSettingsDialog } from "./components/settings/ApplicationSettingsDialog";
import { AssignmentMenu } from "./components/panels/AssignmentMenu";
import { BoardView } from "./components/board/BoardView";
import { EditorPanel } from "./components/panels/EditorPanel";
import { InspectorPanel, type InspectorView } from "./components/panels/InspectorPanel";
import { LogPanel } from "./components/panels/LogPanel";
import { CompilationPanel, type CompilationReport } from "./components/panels/CompilationPanel";
import { Waveform } from "./components/panels/Waveform";
import {
  buildSimulationClocks, effectivePace, formatFrequency, nsPerMs,
  simulatedTimeForWallClock
} from "./simulation";
import type { SimulationClockConfig } from "./simulation";
import type { Assignment, BoardEndpoint, EntityPort, MappingMode, MappingTarget, WaveSample } from "./types";
import { parseEntityPorts, previewOutputs } from "./vhdl";
import { chooseProjectFolder, createProject, isDesktopApp, listTemplates, openProject, projectFolderName, resolveProjectParent, saveProject, saveProjectAs, showProjectError } from "./projects/api";
import { useProjectWorkspace } from "./projects/useProjectWorkspace";
import { hasInitialProject, validateProjectManifest } from "./projects/model";
import { isProjectSourceDirty, shouldContinueProjectAction } from "./projects/model";
import type { LoadedProject, ProjectTemplate } from "./projects/model";
import { addRecentProject, loadRecentProjects, parentPath, projectParentKey, recentProjectsKey } from "./projects/recent";
import { useI18n } from "./i18n";
import { bottomPaneLimits, minimumBottomPaneHeight } from "./layout";

type ContextState = { target: MappingTarget; x: number; y: number; mode: MappingMode } | null;
type PaneSizes = { explorer: number; editor: number; inspector: number; bottom: number };
type CollapsedPanes = { explorer: boolean; inspector: boolean; bottom: boolean };
type ResizeKind = keyof PaneSizes;
type SimState = "stopped" | "running";
type BottomTab = "waveform" | "compilation" | "problems";
type ActivityView = "explorer" | "projects";
type SimulationInputEvent = { timeNs: number; portId: string; value: boolean };
type SimulationSample = { timeNs: number; outputs: Record<string, boolean> };
type SimulationResult = { outputs: Record<string, boolean>; samples: SimulationSample[]; diagnostics: string[]; simulatedTimeNs: number };
type SimulationSessionResult = SimulationResult & { sessionId: string };
type AnalysisResult = { diagnostics: string[]; durationMs: number; engineVersion: string };
type ProjectDialog = "new" | "project-settings" | "application-settings" | null;

const defaultPaneSizes: PaneSizes = { explorer: 185, editor: 350, inspector: 300, bottom: minimumBottomPaneHeight };
const defaultCollapsed: CollapsedPanes = { explorer: true, inspector: true, bottom: true };
const emptyPortValues: Record<string, boolean> = {};
const initialSimulationWarmupNs = 20_000_000;
const paneLimits: Record<ResizeKind, [number, number]> = {
  explorer: [132, 310],
  editor: [280, 620],
  inspector: [240, 520],
  bottom: [minimumBottomPaneHeight, 360]
};

const loadStored = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
};

const isTauriApp = isDesktopApp;
const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));
const formatSimTime = (ns: number) => ns >= 1_000_000
  ? `${(ns / 1_000_000).toFixed(1)} ms`
  : `${ns} ns`;

function rawEndpointValue(endpoint: BoardEndpoint, inputs: Record<string, boolean>, assignments: ReturnType<typeof expandAssignments>, portValues: Record<string, boolean>) {
  if (endpoint.direction === "in") return !!inputs[endpoint.id];
  const assignment = assignments.find((item) => item.endpointId === endpoint.id);
  return assignment ? !!portValues[assignment.portId] : false;
}

function visualEndpointValue(endpoint: BoardEndpoint, inputs: Record<string, boolean>, assignments: ReturnType<typeof expandAssignments>, portValues: Record<string, boolean>) {
  const raw = rawEndpointValue(endpoint, inputs, assignments, portValues);
  return endpoint.direction === "out" && endpoint.activeLow ? !raw : raw;
}

export default function App() {
  const { t } = useI18n();
  const workspace = useProjectWorkspace();
  const { project, manifest, assignments, setAssignments, setBoardId, setManifest, dirty: projectDirty, activeIsConstraints,
    activeSource, topSource, entityNames, setActivePath, closePath, updateActiveContent, load, markSaved, sourcePayloads, sourceStateKey, constraintsPath } = workspace;
  const source = topSource?.content ?? "";
  const selectedBoardId = manifest.boardId;
  const [inputs, setInputs] = useState<Record<string, boolean>>({ KEY0: true, KEY1: true, KEY2: true, KEY3: true });
  const [simulatedOutputs, setSimulatedOutputs] = useState<Record<string, boolean> | null>(null);
  const [simState, setSimState] = useState<SimState>("stopped");
  const [speed, setSpeed] = useState(1);
  const [context, setContext] = useState<ContextState>(null);
  const [signalSearch, setSignalSearch] = useState("");
  const [inspectorView, setInspectorView] = useState<InspectorView>("assignments");
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [bottomTab, setBottomTab] = useState<BottomTab>("waveform");
  const [projectMenuOpen, setProjectMenuOpen] = useState(false);
  const [projectSwitcherOpen, setProjectSwitcherOpen] = useState(false);
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(null);
  const [hasProject, setHasProject] = useState(() => hasInitialProject(project));
  const [activityView, setActivityView] = useState<ActivityView>(project.legacyRecovered ? "explorer" : "projects");
  const [initialTemplateId, setInitialTemplateId] = useState<string | undefined>();
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [assignmentToRemove, setAssignmentToRemove] = useState<{ targetId: string; label: string } | null>(null);
  const [projectParent, setProjectParent] = useState(() => localStorage.getItem(projectParentKey) ?? "");
  const [recentProjects, setRecentProjects] = useState(loadRecentProjects);
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(() => loadStored("logicboard.paneSizes", defaultPaneSizes));
  const [collapsed, setCollapsed] = useState<CollapsedPanes>(() => loadStored("logicboard.collapsedPanes.v2", defaultCollapsed));
  const [waveform, setWaveform] = useState<WaveSample[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [analysisProblems, setAnalysisProblems] = useState<string[]>([]);
  const [runtimeProblems, setRuntimeProblems] = useState<string[]>([]);
  const [compilationLog, setCompilationLog] = useState<string[]>([]);
  const [compilationReport, setCompilationReport] = useState<CompilationReport | null>(null);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const [simPace, setSimPace] = useState(1);
  const timeRef = useRef(0);
  const simulatedTimeNsRef = useRef(0);
  const simulationWallStartMsRef = useRef(0);
  const simulationBaseNsRef = useRef(0);
  const lastAdvanceWallMsRef = useRef(0);
  const lastAdvanceSimNsRef = useRef(0);
  const inputEventsRef = useRef<SimulationInputEvent[]>([]);
  const pendingInputEventsRef = useRef<SimulationInputEvent[]>([]);
  const initialInputPortValuesRef = useRef<Record<string, boolean>>({});
  const simulationSessionIdRef = useRef<string | null>(null);
  const simulationAdvanceInFlightRef = useRef(false);
  const pendingProjectActionRef = useRef<(() => Promise<void>) | null>(null);
  const previousInputsRef = useRef(inputs);
  const lastAnalyzedSourceRef = useRef<string | null>(null);
  const analysisRevisionRef = useRef(0);

  const topEntity = manifest.topEntity;
  const selectedBoard = useMemo(() => boards.find((board) => board.id === selectedBoardId) ?? cycloneII, [selectedBoardId]);
  const ports = useMemo(() => parseEntityPorts(source), [source]);
  const expandedAssignments = useMemo(() => expandAssignments(assignments, selectedBoard, ports), [assignments, ports, selectedBoard]);
  const mappingProblems = useMemo(() => validateAssignments(assignments, selectedBoard, ports), [assignments, ports, selectedBoard]);
  const constraints = useMemo(
    () => generateQsf(assignments, selectedBoard, ports, topEntity),
    [assignments, ports, selectedBoard, topEntity]
  );
  const simulationClocks = useMemo<SimulationClockConfig[]>(
    () => buildSimulationClocks(expandedAssignments, selectedBoard.endpoints),
    [expandedAssignments, selectedBoard.endpoints]
  );
  const clockNotice = useMemo(() => {
    if (!simulationClocks.length) return null;
    const simulationLabels = Array.from(new Set(simulationClocks.map((clock) => formatFrequency(clock.simulationFrequencyHz))));
    const physicalLabels = simulationClocks.map((clock) => `${clock.label}: ${t("clock.hardware")} ${formatFrequency(clock.frequencyHz)}`);
    return {
      simulation: simulationLabels.join(" / "),
      physical: physicalLabels.join(", ")
    };
  }, [simulationClocks, t]);
  const localProjectProblems = useMemo(() => {
    const localProblems = validateProjectManifest(manifest, project.sources);
    if (!ports.length) localProblems.push("The top entity has no supported in/out ports.");
    return localProblems;
  }, [manifest, ports.length, project.sources]);
  const visibleProblems = useMemo(
    () => Array.from(new Set([...localProjectProblems, ...mappingProblems, ...analysisProblems, ...runtimeProblems])),
    [analysisProblems, localProjectProblems, mappingProblems, runtimeProblems]
  );

  const inputPortValues = useMemo(() => {
    const mapped: Record<string, boolean> = {};
    for (const assignment of expandedAssignments) {
      const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment.endpointId);
      if (endpoint?.direction === "in") mapped[assignment.portId] = !!inputs[endpoint.id];
    }
    return mapped;
  }, [expandedAssignments, inputs, selectedBoard.endpoints]);
  const portValues = simulatedOutputs ?? emptyPortValues;

  const endpointValue = useCallback((endpoint: BoardEndpoint) =>
    visualEndpointValue(endpoint, inputs, expandedAssignments, portValues),
  [expandedAssignments, inputs, portValues]);
  const currentSimulationTargetNs = useCallback((wallNowMs = performance.now()) =>
    simulatedTimeForWallClock(
      wallNowMs,
      simulationWallStartMsRef.current,
      simulationBaseNsRef.current,
      speed
    ),
  [speed]);
  const recordPace = useCallback((simulatedTimeNs: number, wallNowMs = performance.now()) => {
    const simulatedDeltaNs = Math.max(0, simulatedTimeNs - lastAdvanceSimNsRef.current);
    const wallDeltaMs = Math.max(0, wallNowMs - lastAdvanceWallMsRef.current);
    setSimPace(effectivePace(simulatedDeltaNs, wallDeltaMs));
    lastAdvanceSimNsRef.current = simulatedTimeNs;
    lastAdvanceWallMsRef.current = wallNowMs;
  }, []);

  useEffect(() => { localStorage.setItem("logicboard.paneSizes", JSON.stringify(paneSizes)); }, [paneSizes]);
  useEffect(() => { localStorage.setItem("logicboard.collapsedPanes.v2", JSON.stringify(collapsed)); }, [collapsed]);
  useEffect(() => { localStorage.setItem(recentProjectsKey, JSON.stringify(recentProjects)); }, [recentProjects]);
  useEffect(() => { if (projectParent) localStorage.setItem(projectParentKey, projectParent); }, [projectParent]);
  useEffect(() => {
    if (projectDialog !== "new" || !isDesktopApp()) return;
    void resolveProjectParent(projectParent || undefined)
      .then(({ parentPath: resolved }) => setProjectParent(resolved))
      .catch((error) => setRuntimeProblems([String(error)]));
  }, [projectDialog]);
  useEffect(() => {
    if (!isDesktopApp()) return;
    void listTemplates().then(setProjectTemplates).catch((error) => setRuntimeProblems([String(error)]));
  }, []);
  useEffect(() => { setProblems(visibleProblems); }, [visibleProblems]);
  useEffect(() => { setRuntimeProblems([]); }, [assignments, sourceStateKey]);
  useEffect(() => {
    const revision = ++analysisRevisionRef.current;
    setAnalysisProblems([]);
    if (lastAnalyzedSourceRef.current === sourceStateKey || localProjectProblems.length) return;

    const timer = window.setTimeout(async () => {
      if (lastAnalyzedSourceRef.current === sourceStateKey) return;
      lastAnalyzedSourceRef.current = sourceStateKey;
      if (!isTauriApp()) return;

      try {
        const { invoke } = await import("@tauri-apps/api/core");
        const result = await invoke<string[]>("analyze_project", { sources: sourcePayloads });
        if (analysisRevisionRef.current === revision) setAnalysisProblems(result);
      } catch (error) {
        if (analysisRevisionRef.current === revision) setAnalysisProblems([String(error)]);
      }
    }, 650);

    return () => window.clearTimeout(timer);
  }, [localProjectProblems, sourcePayloads, sourceStateKey]);
  useEffect(() => {
    if (simState !== "running") return;
    if (!simulationClocks.length || isTauriApp()) return;
    const timer = window.setInterval(() => {
      timeRef.current += 10;
      const values = Object.fromEntries(expandedAssignments.map((assignment) => {
        const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment.endpointId);
        return [assignment.endpointId, endpoint ? endpointValue(endpoint) : false];
      }));
      setWaveform([{ time: timeRef.current, values }]);
    }, Math.max(40, 160 / speed));
    return () => window.clearInterval(timer);
  }, [endpointValue, expandedAssignments, selectedBoard.endpoints, simState, simulationClocks.length, speed]);

  const stopActiveSimulationSession = useCallback(async () => {
    const sessionId = simulationSessionIdRef.current;
    simulationSessionIdRef.current = null;
    if (!sessionId || !isTauriApp()) return;
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("stop_simulation_session", { sessionId });
    } catch {
      // The session may already have exited after a simulation error.
    }
  }, []);

  const reset = () => {
    void stopActiveSimulationSession();
    setSimState("stopped");
    setInputs({ KEY0: true, KEY1: true, KEY2: true, KEY3: true });
    setSimulatedOutputs(null);
    setWaveform([]);
    timeRef.current = 0;
    simulatedTimeNsRef.current = 0;
    simulationWallStartMsRef.current = 0;
    simulationBaseNsRef.current = 0;
    lastAdvanceWallMsRef.current = 0;
    lastAdvanceSimNsRef.current = 0;
    inputEventsRef.current = [];
    pendingInputEventsRef.current = [];
    initialInputPortValuesRef.current = {};
    setSimPace(1);
  };

  const reportProjectError = (error: unknown, blocking = true) => {
    setRuntimeProblems([String(error)]);
    setBottomTab("problems");
    if (blocking) void showProjectError(error, t("project.error.title"));
  };

  const rememberProject = (loaded: LoadedProject) => {
    setRecentProjects((current) => addRecentProject(current, loaded));
    setProjectParent(parentPath(loaded.rootPath));
  };

  const replaceProject = (loaded: LoadedProject) => {
    reset();
    load(loaded);
    setHasProject(true);
    setActivityView("explorer");
    rememberProject(loaded);
    setProjectDialog(null);
    setProjectMenuOpen(false);
    setAnalysisProblems([]);
    setRuntimeProblems([]);
    setCompilationLog([]);
    setCompilationReport(null);
  };

  const persistProject = async (saveAs = false) => {
    if (!isDesktopApp()) {
      reportProjectError(t("project.desktopOnly"));
      return false;
    }
    setProjectBusy(true);
    try {
      const validationProblems = validateProjectManifest(manifest, project.sources);
      if (validationProblems.length) {
        reportProjectError(validationProblems.join("\n"), false);
        return false;
      }
      const payload = { manifest, sources: project.sources };
      const loaded = project.rootPath && !saveAs
        ? await saveProject(project.rootPath, payload)
        : await (async () => {
          const resolved = await resolveProjectParent(projectParent || undefined);
          const selectedParent = await chooseProjectFolder(resolved.parentPath);
          if (!selectedParent) return null;
          setProjectParent(selectedParent);
          return saveProjectAs(selectedParent, projectFolderName(manifest.name), payload);
        })();
      if (!loaded) return false;
      markSaved(loaded);
      rememberProject(loaded);
      setRuntimeProblems([]);
      return true;
    } catch (error) {
      reportProjectError(error);
      return false;
    } finally {
      setProjectBusy(false);
    }
  };

  const runProjectAction = (action: () => Promise<void>) => {
    setProjectMenuOpen(false);
    setProjectSwitcherOpen(false);
    if (hasProject && projectDirty) {
      pendingProjectActionRef.current = action;
      setUnsavedOpen(true);
    } else {
      void action();
    }
  };

  const openExistingProject = () => runProjectAction(async () => {
    setProjectBusy(true);
    try {
      const projectPath = await chooseProjectFolder(projectParent || undefined);
      if (!projectPath) return;
      replaceProject(await openProject(projectPath));
    } catch (error) {
      reportProjectError(error);
    } finally {
      setProjectBusy(false);
    }
  });

  const openRecentProject = (projectPath: string) => runProjectAction(async () => {
    if (project.rootPath?.toLocaleLowerCase() === projectPath.toLocaleLowerCase()) return;
    setProjectBusy(true);
    try {
      replaceProject(await openProject(projectPath));
    } catch (error) {
      reportProjectError(error);
    } finally {
      setProjectBusy(false);
    }
  });

  const showNewProject = (templateId?: string) => runProjectAction(async () => {
    setInitialTemplateId(templateId);
    setProjectDialog("new");
  });

  const createNewProject = async (name: string, folderName: string, templateId: string, parent: string) => {
    setProjectDialog(null);
    setProjectBusy(true);
    try {
      replaceProject(await createProject(parent, folderName, templateId, name));
      setInitialTemplateId(undefined);
    } catch (error) {
      reportProjectError(error);
    } finally {
      setProjectBusy(false);
    }
  };

  const browseProjectParent = async () => {
    try {
      const resolved = await resolveProjectParent(projectParent || undefined);
      const selected = await chooseProjectFolder(resolved.parentPath);
      if (selected) setProjectParent(selected);
    } catch (error) {
      reportProjectError(error);
    }
  };

  const continuePendingAction = async (decision: "save" | "discard") => {
    const action = pendingProjectActionRef.current;
    if (!action) return;
    const saveSucceeded = decision === "save" ? await persistProject() : false;
    if (!shouldContinueProjectAction(decision, saveSucceeded)) return;
    pendingProjectActionRef.current = null;
    setUnsavedOpen(false);
    await action();
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        void persistProject();
      }
    };
    window.addEventListener("keydown", keydown);
    return () => window.removeEventListener("keydown", keydown);
  });

  useEffect(() => {
    if (!isDesktopApp()) return;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void import("@tauri-apps/api/window").then(async ({ getCurrentWindow }) => {
      const currentWindow = getCurrentWindow();
      const cleanup = await currentWindow.onCloseRequested((event) => {
        if (!projectDirty) return;
        event.preventDefault();
        pendingProjectActionRef.current = async () => { await currentWindow.destroy(); };
        setUnsavedOpen(true);
      });
      if (disposed) cleanup(); else unlisten = cleanup;
    });
    return () => { disposed = true; unlisten?.(); };
  }, [projectDirty]);

  const assign = (assignment: Assignment) => {
    setAssignments((old) => applyAssignment(old, assignment));
    setContext(null);
    setSignalSearch("");
  };

  const requestAssignmentRemoval = (targetId: string) => {
    const group = selectedBoard.groups.find((item) => item.id === targetId);
    const endpoint = selectedBoard.endpoints.find((item) => item.id === targetId);
    const expanded = expandedAssignments.find((item) => item.endpointId === targetId);
    setAssignmentToRemove({ targetId, label: expanded?.portId ?? endpoint?.label ?? group?.label ?? targetId });
    setContext(null);
  };

  const confirmAssignmentRemoval = () => {
    if (!assignmentToRemove) return;
    setAssignments((old) => removeAssignmentTarget(old, selectedBoard, ports, assignmentToRemove.targetId));
    setAssignmentToRemove(null);
  };

  const togglePane = (pane: keyof CollapsedPanes) => setCollapsed((old) => {
    if (pane === "bottom" && old.bottom) setPaneSizes((sizes) => ({ ...sizes, bottom: paneLimits.bottom[0] }));
    return { ...old, [pane]: !old[pane] };
  });
  const resetPane = (kind: ResizeKind) => setPaneSizes((old) => ({ ...old, [kind]: defaultPaneSizes[kind] }));
  const changeSpeed = useCallback((nextSpeed: number) => {
    if (simState === "running") {
      simulationBaseNsRef.current = simulatedTimeNsRef.current;
      simulationWallStartMsRef.current = performance.now();
    }
    setSpeed(nextSpeed);
  }, [simState]);

  const startResize = useCallback((kind: ResizeKind, event: ReactPointerEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const start = paneSizes[kind];
    setCollapsed((old) => kind === "explorer" || kind === "inspector" || kind === "bottom" ? { ...old, [kind]: false } : old);

    const move = (moveEvent: PointerEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaY = moveEvent.clientY - startY;
      const next = kind === "inspector" ? start - deltaX : kind === "bottom" ? start - deltaY : start + deltaX;
      const limits: [number, number] = kind === "bottom"
        ? bottomPaneLimits(document.querySelector(".workspace")?.clientHeight ?? window.innerHeight)
        : paneLimits[kind];
      setPaneSizes((old) => ({ ...old, [kind]: clamp(next, limits) }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [paneSizes]);

  const appendWaveSample = useCallback((outputs: Record<string, boolean>) => {
    timeRef.current = simulationClocks.length ? timeRef.current + 10 : 0;
    const values = Object.fromEntries(expandedAssignments.map((assignment) => {
      const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment.endpointId);
      if (!endpoint) return [assignment.endpointId, false];
      return [assignment.endpointId, visualEndpointValue(endpoint, inputs, expandedAssignments, outputs)];
    }));
    setWaveform([{ time: timeRef.current, values }]);
  }, [expandedAssignments, inputs, selectedBoard.endpoints, simulationClocks.length]);

  const appendSimulationSamples = useCallback((samples: SimulationSample[]) => {
    if (!samples.length) return;
    const sample = samples[samples.length - 1];
    timeRef.current = sample.timeNs;
    const values = Object.fromEntries(expandedAssignments.map((assignment) => [
      assignment.endpointId,
      !!sample.outputs[assignment.portId]
    ]));
    setWaveform([{ time: sample.timeNs, values }]);
  }, [expandedAssignments]);

  const validateProject = useCallback(() => {
    return localProjectProblems;
  }, [localProjectProblems]);

  const compileProject = useCallback(async () => {
    const startedAt = performance.now();
    const report: CompilationReport = {
      status: "running",
      engine: isTauriApp() ? "GHDL" : t("compile.report.previewEngine"),
      standard: "VHDL 2008",
      projectName: manifest.name,
      board: `${selectedBoard.name} · ${selectedBoard.device}`,
      topEntity,
      sources: sourcePayloads.map((item) => ({ path: item.name, lines: item.content.split(/\r?\n/).length })),
      inputPorts: ports.filter((port) => port.direction === "in").length,
      outputPorts: ports.filter((port) => port.direction === "out").length,
      assignments: expandedAssignments.length,
      clocks: simulationClocks.map((clock) => `${clock.label} ${formatFrequency(clock.simulationFrequencyHz)}`),
      preview: !isTauriApp()
    };
    setIsCompiling(true);
    setRuntimeProblems([]);
    setCompilationLog([t("compile.start")]);
    setCompilationReport(report);
    setBottomTab("compilation");

    const localProblems = validateProject();
    if (localProblems.length) {
      setCompilationLog([t("compile.blocked")]);
      setCompilationReport({ ...report, status: "blocked", durationMs: performance.now() - startedAt });
      setBottomTab("problems");
      setIsCompiling(false);
      return false;
    }

    try {
      if (!isTauriApp()) {
        setCompilationLog([t("compile.preview"), ...mappingProblems.map((item) => t("compile.mappingWarning", { message: item }))]);
        setCompilationReport({ ...report, status: "success", durationMs: performance.now() - startedAt });
        return true;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<AnalysisResult>("analyze_project", { sources: sourcePayloads });
      setCompilationLog([...(result.diagnostics.length ? result.diagnostics : [t("compile.success")]), ...mappingProblems.map((item) => t("compile.mappingWarning", { message: item }))]);
      setCompilationReport({ ...report, status: "success", durationMs: result.durationMs, engineVersion: result.engineVersion });
      return true;
    } catch (error) {
      setRuntimeProblems([String(error)]);
      setCompilationLog([t("compile.failed")]);
      setCompilationReport({ ...report, status: "failed", durationMs: performance.now() - startedAt });
      setBottomTab("problems");
      return false;
    } finally {
      setIsCompiling(false);
    }
  }, [expandedAssignments.length, manifest.name, mappingProblems, ports, selectedBoard.device, selectedBoard.name, simulationClocks, sourcePayloads, t, topEntity, validateProject]);

  const stopSimulation = useCallback(() => {
    void stopActiveSimulationSession();
    setSimState("stopped");
    setSimulatedOutputs(null);
  }, [stopActiveSimulationSession]);

  const runSimulation = useCallback(async () => {
    const canRun = await compileProject();
    if (!canRun) return;

    setIsSimulating(true);
    try {
      simulatedTimeNsRef.current = 0;
      const wallStartMs = performance.now();
      simulationWallStartMsRef.current = wallStartMs;
      simulationBaseNsRef.current = 0;
      lastAdvanceWallMsRef.current = wallStartMs;
      lastAdvanceSimNsRef.current = 0;
      setSimPace(1);
      inputEventsRef.current = [];
      pendingInputEventsRef.current = [];
      initialInputPortValuesRef.current = inputPortValues;
      if (!isTauriApp()) {
        const previewValues = previewOutputs(source, inputPortValues, ports);
        setSimulatedOutputs(previewValues);
        setRuntimeProblems([]);
        setSimState("running");
        setBottomTab("waveform");
        appendWaveSample(previewValues);
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const previousTimeNs = simulatedTimeNsRef.current;
      const durationNs = initialSimulationWarmupNs;
      const started = await invoke<SimulationSessionResult>("start_simulation_session", {
        sources: sourcePayloads,
        topEntity,
        ports,
        inputs: initialInputPortValuesRef.current,
        clocks: simulationClocks.map(({ portId, halfPeriodPs }) => ({ portId, halfPeriodPs }))
      });
      simulationSessionIdRef.current = started.sessionId;
      const result = await invoke<SimulationResult>("step_simulation_session", {
        sessionId: started.sessionId,
        targetTimeNs: durationNs,
        inputEvents: []
      });
      const doneWallMs = performance.now();
      simulatedTimeNsRef.current = result.simulatedTimeNs;
      recordPace(result.simulatedTimeNs, doneWallMs);
      simulationWallStartMsRef.current = doneWallMs;
      simulationBaseNsRef.current = result.simulatedTimeNs;
      setSimulatedOutputs(result.outputs);
      setRuntimeProblems([]);
      setCompilationLog((old) => [
        ...old,
        "",
        ...(result.diagnostics.length ? result.diagnostics : [t("simulation.success", { time: formatSimTime(result.simulatedTimeNs) })])
      ]);
      setSimState("running");
      setBottomTab("waveform");
      appendSimulationSamples(result.samples.filter((sample) => sample.timeNs > previousTimeNs));
    } catch (error) {
      const message = String(error);
      void stopActiveSimulationSession();
      setRuntimeProblems([message]);
      setCompilationLog((old) => [...old, "", t("simulation.stopped", { message })]);
      setBottomTab("problems");
      setSimState("stopped");
    } finally { setIsSimulating(false); }
  }, [appendSimulationSamples, appendWaveSample, compileProject, inputPortValues, ports, recordPace, simulationClocks, source, sourcePayloads, stopActiveSimulationSession, t, topEntity]);

  const updateRunningSimulation = useCallback(async () => {
    if (simulationAdvanceInFlightRef.current) return;
    simulationAdvanceInFlightRef.current = true;
    try {
      if (!isTauriApp()) {
        const previewValues = previewOutputs(source, inputPortValues, ports);
        setSimulatedOutputs(previewValues);
        setRuntimeProblems([]);
        appendWaveSample(previewValues);
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const sessionId = simulationSessionIdRef.current;
      if (!sessionId) {
        throw new Error(t("simulation.notRunning"));
      }
      const previousTimeNs = simulatedTimeNsRef.current;
      const wallNowMs = performance.now();
      const durationNs = currentSimulationTargetNs(wallNowMs);
      const readyEvents = pendingInputEventsRef.current.filter((event) => event.timeNs <= durationNs);
      pendingInputEventsRef.current = pendingInputEventsRef.current.filter((event) => event.timeNs > durationNs);
      if (durationNs <= previousTimeNs && !readyEvents.length) return;
      const result = await invoke<SimulationResult>("step_simulation_session", {
        sessionId,
        targetTimeNs: durationNs,
        inputEvents: readyEvents
      });
      const doneWallMs = performance.now();
      simulatedTimeNsRef.current = result.simulatedTimeNs;
      recordPace(result.simulatedTimeNs, doneWallMs);
      setSimulatedOutputs(result.outputs);
      setRuntimeProblems([]);
      setCompilationLog((old) => result.diagnostics.length ? [...old, "", ...result.diagnostics] : old);
      appendSimulationSamples(result.samples.filter((sample) => sample.timeNs > previousTimeNs));
    } catch (error) {
      const message = String(error);
      void stopActiveSimulationSession();
      setRuntimeProblems([message]);
      setCompilationLog((old) => [...old, "", t("simulation.stopped", { message })]);
      setBottomTab("problems");
      setSimState("stopped");
    } finally {
      simulationAdvanceInFlightRef.current = false;
    }
  }, [appendSimulationSamples, appendWaveSample, currentSimulationTargetNs, inputPortValues, ports, recordPace, source, sourceStateKey, stopActiveSimulationSession, t]);

  const handleBoardContext = useCallback((target: MappingTarget, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    if (simState === "running") {
      setContext(null);
      return;
    }
    setContext({ target, x: event.clientX, y: event.clientY, mode: target.mode });
    setSignalSearch("");
  }, [simState]);

  const handleBoardInput = useCallback((endpoint: BoardEndpoint, next: boolean) => {
    if (simState === "running") {
      const assignment = expandedAssignments.find((item) => item.endpointId === endpoint.id);
      if (assignment && endpoint.kind !== "clock") {
        const lastEvent = inputEventsRef.current.at(-1);
        const wallTimedSimulationNs = isTauriApp() && simulationClocks.length
          ? currentSimulationTargetNs()
          : simulatedTimeNsRef.current;
        const eventTimeNs = Math.max(wallTimedSimulationNs, (lastEvent?.timeNs ?? -1) + 1);
        const inputEvent = { timeNs: eventTimeNs, portId: assignment.portId, value: next };
        inputEventsRef.current = [...inputEventsRef.current, inputEvent];
        pendingInputEventsRef.current = [...pendingInputEventsRef.current, inputEvent];
      }
    }
    setInputs((old) => old[endpoint.id] === next ? old : { ...old, [endpoint.id]: next });
  }, [currentSimulationTargetNs, expandedAssignments, simState, simulationClocks.length]);

  useEffect(() => {
    void stopActiveSimulationSession();
    setSimulatedOutputs(null);
    setSimState("stopped");
    simulatedTimeNsRef.current = 0;
    simulationWallStartMsRef.current = 0;
    simulationBaseNsRef.current = 0;
    lastAdvanceWallMsRef.current = 0;
    lastAdvanceSimNsRef.current = 0;
    inputEventsRef.current = [];
    pendingInputEventsRef.current = [];
    initialInputPortValuesRef.current = {};
    setSimPace(1);
  }, [sourceStateKey, stopActiveSimulationSession]);
  useEffect(() => {
    if (previousInputsRef.current === inputs) return;
    previousInputsRef.current = inputs;
    if (simState === "running") void updateRunningSimulation();
  }, [inputs, simState, updateRunningSimulation]);
  useEffect(() => {
    if (simState !== "running" || !isTauriApp() || !simulationClocks.length) return;
    const timer = window.setInterval(() => { void updateRunningSimulation(); }, Math.max(80, 91 / speed));
    return () => window.clearInterval(timer);
  }, [simState, simulationClocks.length, speed, updateRunningSimulation]);

  const fileName = (path: string) => path.split("/").at(-1) ?? path;
  const activeContent = activeIsConstraints ? constraints : activeSource?.content ?? "";
  const availableEditorTabs = [
    ...project.sources.map((item) => ({
      path: item.path,
      name: fileName(item.path),
      modified: isProjectSourceDirty(project, item.path)
    })),
    { path: constraintsPath, name: constraintsPath, readOnly: true }
  ];
  const editorTabs = project.openPaths
    .map((path) => availableEditorTabs.find((tab) => tab.path === path))
    .filter((tab): tab is NonNullable<typeof tab> => Boolean(tab));
  const workspaceStyle = {
    "--explorer-width": `${activityView === "projects" ? 260 : collapsed.explorer ? 34 : paneSizes.explorer}px`,
    "--editor-width": `${paneSizes.editor}px`,
    "--inspector-width": `${collapsed.inspector ? 34 : paneSizes.inspector}px`,
    "--bottom-height": `${collapsed.bottom ? 34 : paneSizes.bottom}px`
  } as CSSProperties;
  const isRunBusy = isCompiling || isSimulating;
  const isClockedSimulation = simulationClocks.length > 0;
  const statusLabel = isCompiling ? t("status.compiling") : isSimulating ? t("status.starting") : simState === "stopped" ? t("status.ready") : isClockedSimulation ? t("status.running") : t("status.interactive");
  const paceLabel = simState === "running"
    ? simPace < speed * 0.9
      ? t("pace.behind", { pace: simPace.toFixed(2) })
      : t("pace.effective", { pace: simPace.toFixed(2) })
    : t("pace.adjust");
  const clockNoticeTooltip = clockNotice
    ? t("clock.tooltip", { simulation: clockNotice.simulation, physical: clockNotice.physical, pace: paceLabel })
    : "";

  return <div className="app" onClick={() => { if (context) setContext(null); if (projectMenuOpen) setProjectMenuOpen(false); if (projectSwitcherOpen) setProjectSwitcherOpen(false); }}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Activity size={19} /></div><strong>LogicBoard</strong><span>STUDIO</span></div>
      <div className="project-control" onClick={(event) => event.stopPropagation()}>
        <button className="project-button" disabled={projectBusy} onClick={() => { setProjectMenuOpen(false); setProjectSwitcherOpen((open) => !open); }}><FolderOpen size={16} /><div><small>{t("project.label")}</small><b>{hasProject ? `${manifest.name}${projectDirty ? " •" : ""}` : t("project.none")}</b></div><ChevronDown size={14} /></button>
        {projectSwitcherOpen && <ProjectSwitcher currentPath={hasProject ? project.rootPath : null} recentProjects={recentProjects} templates={projectTemplates} onSelect={(path) => void openRecentProject(path)} onTemplate={(templateId) => { setProjectSwitcherOpen(false); showNewProject(templateId); }} />}
        <button className="project-actions-button" title={t("project.actions")} aria-label={t("project.actions")} onClick={() => { setProjectSwitcherOpen(false); setProjectMenuOpen((open) => !open); }}><MoreHorizontal size={17} /></button>
        {projectMenuOpen && <ProjectMenu
          onNew={() => { setProjectMenuOpen(false); showNewProject(); }}
          onOpen={() => { setProjectMenuOpen(false); void openExistingProject(); }}
          onTemplates={() => { setProjectMenuOpen(false); setActivityView("projects"); showNewProject(projectTemplates.find((template) => template.id !== "blank")?.id); }}
          onSaveAs={() => { setProjectMenuOpen(false); void persistProject(true); }}
          onSettings={() => { setProjectMenuOpen(false); setProjectDialog("project-settings"); }}
          hasProject={hasProject}
        />}
      </div>
      <div className="top-spacer" />
      {hasProject && <div className={`status ${isCompiling ? "compiling" : simState}`}><i />{statusLabel}</div>}
      <button className="icon-button" disabled={!hasProject || projectBusy || (Boolean(project.rootPath) && !projectDirty)} title={t("project.save.title")} onClick={() => void persistProject()}><Save size={17} /></button>
      <button className="icon-button" title={t("settings.title")} onClick={() => setProjectDialog("application-settings")}><Settings2 size={17} /></button>
    </header>

    {hasProject && <div className="toolbar">
      <label className="board-select">
        <Cpu size={16} />
        <span>
          <small>{t("toolbar.targetBoard")}</small>
          <select
            value={selectedBoardId}
            onChange={(event) => {
              setBoardId(event.target.value);
              reset();
            }}
            title={boards.length === 1 ? t("toolbar.onlyBoard") : t("toolbar.changeBoard")}
          >
            {boards.map((board) => <option key={board.id} value={board.id}>{t(`board.name.${board.id}`)} - {board.device}</option>)}
          </select>
        </span>
      </label>
      {clockNotice && <div className={`clock-notice ${simState === "running" ? "running" : ""}`} title={clockNoticeTooltip} aria-label={clockNoticeTooltip}>
        <Info size={14} />
        <span>{t("toolbar.clockNotice", { frequency: clockNotice.simulation })}</span>
      </div>}
      <div className="toolbar-spacer" />
      <button className={`control ${simState === "running" && isClockedSimulation ? "quiet" : ""}`} disabled={isRunBusy} onClick={() => simState === "running" && isClockedSimulation ? stopSimulation() : void runSimulation()}>
        {simState === "running" && isClockedSimulation ? <CircleStop size={16} /> : <Play size={16} fill="currentColor" />}{simState === "running" && isClockedSimulation ? t("toolbar.stop") : isCompiling ? t("toolbar.compiling") : isSimulating ? t("toolbar.starting") : simState === "running" ? t("toolbar.refresh") : t("toolbar.run")}
      </button>
      <button className="icon-button" onClick={reset} title={t("toolbar.reset")}><RotateCcw size={16} /></button>
      {isClockedSimulation && <label className="speed"><Gauge size={15} /><select value={speed} onChange={(event) => changeSpeed(Number(event.target.value))}><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label>}
    </div>}

    <main className={`workspace ${hasProject ? "" : "no-project"} ${activityView === "explorer" && collapsed.explorer ? "explorer-collapsed" : ""} ${collapsed.inspector ? "inspector-collapsed" : ""} ${collapsed.bottom ? "bottom-collapsed" : ""}`} style={workspaceStyle}>
      <nav className="activity-bar" aria-label={t("activity.title")}>
        <button className={activityView === "explorer" ? "active" : ""} title={t("explorer.title")} onClick={() => setActivityView("explorer")}><FileCode2 size={20} /></button>
        <button className={activityView === "projects" ? "active" : ""} title={t("project.hub")} onClick={() => setActivityView("projects")}><FolderKanban size={20} /></button>
      </nav>
      <aside className="files-panel">
        {activityView === "projects" ? <>
          <div className="panel-heading"><span>{t("project.hub")}</span></div>
          <ProjectHub hasProject={hasProject} projectName={manifest.name} projectPath={project.rootPath} recentProjects={recentProjects} templates={projectTemplates} onNew={() => showNewProject()} onOpen={() => void openExistingProject()} onTemplate={(templateId) => showNewProject(templateId)} onRecent={(path) => void openRecentProject(path)} />
        </> : collapsed.explorer ? <button className="panel-rail compact" title={t("explorer.expand")} onClick={() => togglePane("explorer")}><FileCode2 size={15} /></button> : <>
          <div className="panel-heading"><span>{t("explorer.title")}</span><button className="collapse-button" title={t("explorer.collapse")} onClick={() => togglePane("explorer")}>‹</button></div>
          {hasProject ? <><div className="tree-scroll">
            <div className="tree-root"><ChevronDown size={14} /><b>{manifest.name.toUpperCase()}</b></div>
            {project.sources.map((item) => <button key={item.path} className={`tree-file ${project.activePath === item.path ? "active" : ""}`} title={item.path} onClick={() => setActivePath(item.path)}><FileCode2 size={15} /><span>{fileName(item.path)}</span>{isProjectSourceDirty(project, item.path) && <i>M</i>}</button>)}
            <button className={`tree-file ${activeIsConstraints ? "active" : ""}`} onClick={() => setActivePath(constraintsPath)}><FileCode2 size={15} /><span>{constraintsPath}</span><em>{t("common.generated")}</em></button>
          </div>
          <div className="files-footer"><div><span>{t("explorer.topEntity")}</span><strong>{topEntity}</strong></div></div></> : <p className="empty-list">{t("explorer.noProject")}</p>}
        </>}
      </aside>
      {hasProject ? <>
      <div className="resize-handle vertical explorer-handle" title={t("resize.explorer")} onPointerDown={(event) => startResize("explorer", event)} onDoubleClick={() => resetPane("explorer")} />

      <EditorPanel
        tabs={editorTabs}
        activePath={project.activePath}
        activeContent={activeContent}
        readOnly={activeIsConstraints}
        onSelect={setActivePath}
        onClose={closePath}
        onChange={updateActiveContent}
      />
      <div className="resize-handle vertical editor-handle" title={t("resize.editor")} onPointerDown={(event) => startResize("editor", event)} onDoubleClick={() => resetPane("editor")} />

      <section className="board-panel">
        <BoardView
          board={selectedBoard}
          expandedAssignments={expandedAssignments}
          assignmentEnabled={simState !== "running"}
          value={endpointValue}
          onContext={handleBoardContext}
          onInput={handleBoardInput}
        />
        <div className="board-tip"><Unplug size={15} /><span><b>{t("board.assignedPins", { count: expandedAssignments.length })}</b> - {t("board.constraintsUpdate")}</span></div>
      </section>
      <div className="resize-handle vertical inspector-handle" title={t("resize.inspector")} onPointerDown={(event) => startResize("inspector", event)} onDoubleClick={() => resetPane("inspector")} />

      <InspectorPanel
        board={selectedBoard}
        ports={ports}
        assignments={assignments}
        expandedAssignments={expandedAssignments}
        view={inspectorView}
        search={inspectorSearch}
        collapsed={collapsed.inspector}
        onView={setInspectorView}
        onSearch={setInspectorSearch}
        onToggle={() => togglePane("inspector")}
        onAssign={assign}
        onClear={requestAssignmentRemoval}
      />
      <div className="resize-handle horizontal bottom-handle" title={t("resize.bottom")} onPointerDown={(event) => startResize("bottom", event)} onDoubleClick={() => resetPane("bottom")} />

      <section className="bottom-panel">
        <div className="bottom-tabs"><button className="collapse-button" title={collapsed.bottom ? t("bottom.expand") : t("bottom.collapse")} onClick={() => togglePane("bottom")}>{collapsed.bottom ? "⌃" : "⌄"}</button><button className={bottomTab === "waveform" ? "active" : ""} onClick={() => setBottomTab("waveform")}><Activity size={14} />{t("bottom.sample")}</button><button className={bottomTab === "compilation" ? "active" : ""} onClick={() => setBottomTab("compilation")}><TerminalSquare size={14} />{t("bottom.compilation")}</button><button className={bottomTab === "problems" ? "active" : ""} onClick={() => setBottomTab("problems")}><Info size={14} />{t("bottom.problems")} <i>{problems.length}</i></button><span /> <small>{waveform.length ? isClockedSimulation ? formatSimTime(timeRef.current) : t("wave.combinational") : t("bottom.noCapture")}</small></div>
        {!collapsed.bottom && (bottomTab === "waveform"
          ? <Waveform samples={waveform} assignments={expandedAssignments} timed={isClockedSimulation} />
          : bottomTab === "compilation"
            ? <CompilationPanel report={compilationReport} lines={compilationLog} empty={t("bottom.noCompilation")} />
            : <LogPanel lines={problems} empty={t("bottom.noProblems")} problem />)}
      </section>
      </> : <ProjectWelcome templates={projectTemplates} onNew={() => showNewProject()} onOpen={() => void openExistingProject()} onTemplate={(templateId) => showNewProject(templateId)} />}
    </main>

    {context && <AssignmentMenu
      target={context.target}
      x={context.x}
      y={context.y}
      board={selectedBoard}
      ports={ports}
      assignments={assignments}
      mode={context.mode}
      search={signalSearch}
      endpointValue={endpointValue}
      onMode={(mode) => setContext((old) => old ? { ...old, mode } : old)}
      onSearch={setSignalSearch}
      onAssign={assign}
      onClear={requestAssignmentRemoval}
    />}
    {projectDialog === "new" && <NewProjectDialog
      templates={projectTemplates}
      parentPath={projectParent}
      initialTemplateId={initialTemplateId}
      onCancel={() => setProjectDialog(null)}
      onBrowse={() => void browseProjectParent()}
      onCreate={(name, folderName, templateId, parent) => void createNewProject(name, folderName, templateId, parent)}
    />}
    {projectDialog === "project-settings" && <ProjectSettingsDialog
      name={manifest.name}
      boardId={manifest.boardId}
      topEntity={manifest.topEntity}
      boards={boards}
      entityNames={entityNames}
      onCancel={() => setProjectDialog(null)}
      onSave={(settings) => { setManifest(settings); reset(); setProjectDialog(null); }}
    />}
    {projectDialog === "application-settings" && <ApplicationSettingsDialog onCancel={() => setProjectDialog(null)} />}
    {unsavedOpen && <UnsavedChangesDialog
      projectName={manifest.name}
      saveAs={!project.rootPath}
      onSave={() => void continuePendingAction("save")}
      onDiscard={() => void continuePendingAction("discard")}
      onCancel={() => { pendingProjectActionRef.current = null; setUnsavedOpen(false); }}
    />}
    {assignmentToRemove && <RemoveAssignmentDialog
      label={assignmentToRemove.label}
      onConfirm={confirmAssignmentRemoval}
      onCancel={() => setAssignmentToRemove(null)}
    />}
  </div>;
}
