import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Activity, ChevronDown, CircleStop, Cpu, FileCode2, FolderOpen, Gauge,
  Info, Play, RotateCcw, Save, Search, Settings2, TerminalSquare, Unplug
} from "lucide-react";
import { boards, cycloneII } from "./board";
import {
  applyAssignment, expandAssignments, generateQsf, validateAssignments
} from "./assignments/model";
import { NewProjectDialog, ProjectMenu, ProjectSettingsDialog, UnsavedChangesDialog } from "./components/projects/ProjectControls";
import { AssignmentMenu } from "./components/panels/AssignmentMenu";
import { BoardView } from "./components/board/BoardView";
import { EditorPanel } from "./components/panels/EditorPanel";
import { InspectorPanel, type InspectorView } from "./components/panels/InspectorPanel";
import { LogPanel } from "./components/panels/LogPanel";
import { Waveform } from "./components/panels/Waveform";
import {
  buildSimulationClocks, effectivePace, formatFrequency, nsPerMs,
  simulatedTimeForWallClock
} from "./simulation";
import type { SimulationClockConfig } from "./simulation";
import type { Assignment, BoardEndpoint, EntityPort, MappingMode, MappingTarget, WaveSample } from "./types";
import { parseEntityPorts, previewOutputs } from "./vhdl";
import { chooseProjectFolder, createProject, isDesktopApp, listTemplates, openProject, projectFolderName, saveProject, saveProjectAs } from "./projects/api";
import { useProjectWorkspace } from "./projects/useProjectWorkspace";
import { validateProjectManifest } from "./projects/model";
import { isProjectSourceDirty } from "./projects/model";
import type { LoadedProject, ProjectTemplate } from "./projects/model";

type ContextState = { target: MappingTarget; x: number; y: number; mode: MappingMode } | null;
type PaneSizes = { explorer: number; editor: number; inspector: number; bottom: number };
type CollapsedPanes = { explorer: boolean; inspector: boolean; bottom: boolean };
type ResizeKind = keyof PaneSizes;
type SimState = "stopped" | "running";
type BottomTab = "waveform" | "compilation" | "problems";
type SimulationInputEvent = { timeNs: number; portId: string; value: boolean };
type SimulationSample = { timeNs: number; outputs: Record<string, boolean> };
type SimulationResult = { outputs: Record<string, boolean>; samples: SimulationSample[]; diagnostics: string[]; simulatedTimeNs: number };
type SimulationSessionResult = SimulationResult & { sessionId: string };
type ProjectDialog = "new" | "settings" | null;

const defaultPaneSizes: PaneSizes = { explorer: 185, editor: 350, inspector: 300, bottom: 190 };
const defaultCollapsed: CollapsedPanes = { explorer: true, inspector: true, bottom: true };
const emptyPortValues: Record<string, boolean> = {};
const initialSimulationWarmupNs = 20_000_000;
const paneLimits: Record<ResizeKind, [number, number]> = {
  explorer: [132, 310],
  editor: [280, 620],
  inspector: [240, 520],
  bottom: [96, 360]
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
  const workspace = useProjectWorkspace();
  const { project, manifest, assignments, setAssignments, setBoardId, setManifest, dirty: projectDirty, activeIsConstraints,
    activeSource, topSource, entityNames, setActivePath, updateActiveContent, load, markSaved, sourcePayloads, sourceStateKey, constraintsPath } = workspace;
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
  const [projectDialog, setProjectDialog] = useState<ProjectDialog>(() => isDesktopApp() && !project.legacyRecovered ? "new" : null);
  const [projectTemplates, setProjectTemplates] = useState<ProjectTemplate[]>([]);
  const [unsavedOpen, setUnsavedOpen] = useState(false);
  const [projectBusy, setProjectBusy] = useState(false);
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(() => loadStored("logicboard.paneSizes", defaultPaneSizes));
  const [collapsed, setCollapsed] = useState<CollapsedPanes>(() => loadStored("logicboard.collapsedPanes.v2", defaultCollapsed));
  const [waveform, setWaveform] = useState<WaveSample[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [analysisProblems, setAnalysisProblems] = useState<string[]>([]);
  const [runtimeProblems, setRuntimeProblems] = useState<string[]>([]);
  const [compilationLog, setCompilationLog] = useState<string[]>([]);
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
    const physicalLabels = simulationClocks.map((clock) => `${clock.label}: hardware ${formatFrequency(clock.frequencyHz)}`);
    return {
      simulation: simulationLabels.join(" / "),
      physical: physicalLabels.join(", ")
    };
  }, [simulationClocks]);
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
  useEffect(() => {
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
    if (isTauriApp() && simulationClocks.length) return;
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

  const reportProjectError = (error: unknown) => {
    setRuntimeProblems([String(error)]);
    setBottomTab("problems");
  };

  const replaceProject = (loaded: LoadedProject) => {
    reset();
    load(loaded);
    setProjectDialog(null);
    setProjectMenuOpen(false);
    setAnalysisProblems([]);
    setRuntimeProblems([]);
    setCompilationLog([]);
  };

  const persistProject = async (saveAs = false) => {
    if (!isDesktopApp()) {
      reportProjectError("Project folders are available only in the Tauri desktop application.");
      return false;
    }
    setProjectBusy(true);
    try {
      const payload = { manifest, sources: project.sources };
      const loaded = project.rootPath && !saveAs
        ? await saveProject(project.rootPath, payload)
        : await (async () => {
          const parentPath = await chooseProjectFolder();
          if (!parentPath) return null;
          return saveProjectAs(parentPath, projectFolderName(manifest.name), payload);
        })();
      if (!loaded) return false;
      markSaved(loaded);
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
    if (projectDirty) {
      pendingProjectActionRef.current = action;
      setUnsavedOpen(true);
    } else {
      void action();
    }
  };

  const openExistingProject = () => runProjectAction(async () => {
    setProjectBusy(true);
    try {
      const projectPath = await chooseProjectFolder();
      if (!projectPath) return;
      replaceProject(await openProject(projectPath));
    } catch (error) {
      reportProjectError(error);
    } finally {
      setProjectBusy(false);
    }
  });

  const createNewProject = (name: string, folderName: string, templateId: string) => {
    setProjectDialog(null);
    runProjectAction(async () => {
    setProjectBusy(true);
    try {
      const parentPath = await chooseProjectFolder();
      if (!parentPath) return;
      replaceProject(await createProject(parentPath, folderName, templateId, name));
    } catch (error) {
      reportProjectError(error);
    } finally {
      setProjectBusy(false);
    }
    });
  };

  const continuePendingAction = async (saveFirst: boolean) => {
    const action = pendingProjectActionRef.current;
    if (!action) return;
    if (saveFirst && !(await persistProject())) return;
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

  const clearAssignment = (targetId: string) => {
    const childIds = selectedBoard.groups.find((group) => group.id === targetId)?.children.map((endpoint) => endpoint.id) ?? [];
    setAssignments((old) => old.filter((assignment) => assignment.endpointId !== targetId && !childIds.includes(assignment.endpointId)));
    setContext(null);
  };

  const togglePane = (pane: keyof CollapsedPanes) => setCollapsed((old) => ({ ...old, [pane]: !old[pane] }));
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
      setPaneSizes((old) => ({ ...old, [kind]: clamp(next, paneLimits[kind]) }));
    };
    const stop = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", stop);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", stop, { once: true });
  }, [paneSizes]);

  const appendWaveSample = useCallback((outputs: Record<string, boolean>) => {
    timeRef.current += 10;
    const values = Object.fromEntries(expandedAssignments.map((assignment) => {
      const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment.endpointId);
      if (!endpoint) return [assignment.endpointId, false];
      return [assignment.endpointId, visualEndpointValue(endpoint, inputs, expandedAssignments, outputs)];
    }));
    setWaveform([{ time: timeRef.current, values }]);
  }, [expandedAssignments, inputs, selectedBoard.endpoints]);

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
    setIsCompiling(true);
    setRuntimeProblems([]);
    setCompilationLog(["Starting analysis..."]);
    setBottomTab("compilation");

    const localProblems = validateProject();
    if (localProblems.length) {
      setCompilationLog(["Analysis blocked. See Problems for details."]);
      setBottomTab("problems");
      setIsCompiling(false);
      return false;
    }

    try {
      if (!isTauriApp()) {
        setCompilationLog(["Preview analysis passed. GHDL analysis runs in the Tauri desktop app.", ...mappingProblems.map((item) => `Mapping warning: ${item}`)]);
        return true;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string[]>("analyze_project", { sources: sourcePayloads });
      setCompilationLog([...(result.length ? result : ["GHDL analysis completed successfully."]), ...mappingProblems.map((item) => `Mapping warning: ${item}`)]);
      return true;
    } catch (error) {
      setRuntimeProblems([String(error)]);
      setCompilationLog(["GHDL analysis failed. See Problems for details."]);
      setBottomTab("problems");
      return false;
    } finally {
      setIsCompiling(false);
    }
  }, [mappingProblems, sourcePayloads, validateProject]);

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
        ...(result.diagnostics.length ? result.diagnostics : [`GHDL simulation completed successfully through ${formatSimTime(result.simulatedTimeNs)}.`])
      ]);
      setSimState("running");
      setBottomTab("waveform");
      appendSimulationSamples(result.samples.filter((sample) => sample.timeNs > previousTimeNs));
    } catch (error) {
      const message = String(error);
      void stopActiveSimulationSession();
      setRuntimeProblems([message]);
      setCompilationLog((old) => [...old, "", `Simulation session stopped: ${message}`]);
      setBottomTab("problems");
      setSimState("stopped");
    } finally { setIsSimulating(false); }
  }, [appendSimulationSamples, appendWaveSample, compileProject, inputPortValues, ports, recordPace, simulationClocks, source, sourcePayloads, stopActiveSimulationSession, topEntity]);

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
        throw new Error("Simulation session is not running.");
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
      setCompilationLog((old) => [...old, "", `Simulation session stopped: ${message}`]);
      setBottomTab("problems");
      setSimState("stopped");
    } finally {
      simulationAdvanceInFlightRef.current = false;
    }
  }, [appendSimulationSamples, appendWaveSample, currentSimulationTargetNs, inputPortValues, ports, recordPace, source, sourceStateKey, stopActiveSimulationSession]);

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
  const activeFileName = activeIsConstraints ? constraintsPath : fileName(activeSource?.path ?? "No source");
  const editorTabs = [
    ...project.sources.map((item) => ({
      path: item.path,
      name: fileName(item.path),
      modified: isProjectSourceDirty(project, item.path)
    })),
    { path: constraintsPath, name: constraintsPath, readOnly: true }
  ];
  const workspaceStyle = {
    "--explorer-width": `${collapsed.explorer ? 34 : paneSizes.explorer}px`,
    "--editor-width": `${paneSizes.editor}px`,
    "--inspector-width": `${collapsed.inspector ? 34 : paneSizes.inspector}px`,
    "--bottom-height": `${collapsed.bottom ? 34 : paneSizes.bottom}px`
  } as CSSProperties;
  const isRunBusy = isCompiling || isSimulating;
  const statusLabel = isCompiling ? "Compiling" : isSimulating ? "Starting" : simState === "stopped" ? "Ready" : "Running";
  const paceLabel = simState === "running"
    ? simPace < speed * 0.9
      ? `Behind: ${simPace.toFixed(2)}x`
      : `Effective pace: ~${simPace.toFixed(2)}x`
    : "Adjust clock constants before running.";
  const clockNoticeTooltip = clockNotice
    ? `Interactive simulation uses ${clockNotice.simulation} board clocks.\nIf your VHDL uses hardware clock constants such as 50_000_000, adjust them for simulation, e.g. 1_000.\n${clockNotice.physical} · Sim clock: ${clockNotice.simulation} · ${paceLabel}`
    : "";

  return <div className="app" onClick={() => { if (context) setContext(null); if (projectMenuOpen) setProjectMenuOpen(false); }}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Activity size={19} /></div><strong>LogicBoard</strong><span>STUDIO</span></div>
      <div className="project-control" onClick={(event) => event.stopPropagation()}>
        <button className="project-button" disabled={projectBusy} onClick={() => setProjectMenuOpen((open) => !open)}><FolderOpen size={16} /><div><small>PROJECT</small><b>{manifest.name}{projectDirty ? " •" : ""}</b></div><ChevronDown size={14} /></button>
        {projectMenuOpen && <ProjectMenu
          onNew={() => { setProjectMenuOpen(false); setProjectDialog("new"); }}
          onOpen={() => { setProjectMenuOpen(false); void openExistingProject(); }}
          onSaveAs={() => { setProjectMenuOpen(false); void persistProject(true); }}
          onSettings={() => { setProjectMenuOpen(false); setProjectDialog("settings"); }}
        />}
      </div>
      <div className="top-spacer" />
      <div className={`status ${isCompiling ? "compiling" : simState}`}><i />{statusLabel}</div>
      <button className="icon-button" disabled={!projectDirty || projectBusy} title="Save project (Ctrl+S)" onClick={() => void persistProject()}><Save size={17} /></button>
      <button className="icon-button" disabled={projectBusy} title="Project settings" onClick={() => setProjectDialog("settings")}><Settings2 size={17} /></button>
    </header>

    <div className="toolbar">
      <label className="board-select">
        <Cpu size={16} />
        <span>
          <small>TARGET BOARD</small>
          <select
            value={selectedBoardId}
            onChange={(event) => {
              setBoardId(event.target.value);
              reset();
            }}
            title={boards.length === 1 ? "Only EP2C20F484C7 is available right now" : "Changing boards resets the simulation"}
          >
            {boards.map((board) => <option key={board.id} value={board.id}>{board.name} - {board.device}</option>)}
          </select>
        </span>
      </label>
      <div className="device-chip">{selectedBoard.device}</div>
      {clockNotice && <div className={`clock-notice ${simState === "running" ? "running" : ""}`} title={clockNoticeTooltip} aria-label={clockNoticeTooltip}>
        <Info size={14} />
        <span>Interactive simulation uses {clockNotice.simulation} board clocks.</span>
      </div>}
      <div className="toolbar-spacer" />
      <button className={`control ${simState === "running" ? "quiet" : ""}`} disabled={simState !== "running" && isRunBusy} onClick={() => simState === "running" ? stopSimulation() : void runSimulation()}>
        {simState === "running" ? <CircleStop size={16} /> : <Play size={16} fill="currentColor" />}{simState === "running" ? "Stop" : isCompiling ? "Compiling..." : isSimulating ? "Starting..." : "Run"}
      </button>
      <button className="icon-button" onClick={reset} title="Reset simulation"><RotateCcw size={16} /></button>
      <label className="speed"><Gauge size={15} /><select value={speed} onChange={(event) => changeSpeed(Number(event.target.value))}><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label>
    </div>

    <main className={`workspace ${collapsed.explorer ? "explorer-collapsed" : ""} ${collapsed.inspector ? "inspector-collapsed" : ""} ${collapsed.bottom ? "bottom-collapsed" : ""}`} style={workspaceStyle}>
      <aside className="files-panel">
        {collapsed.explorer ? <button className="panel-rail compact" title="Expand explorer" onClick={() => togglePane("explorer")}><FileCode2 size={15} /></button> : <>
          <div className="panel-heading"><span>EXPLORER</span><button className="collapse-button" title="Collapse explorer" onClick={() => togglePane("explorer")}>‹</button></div>
          <div className="tree-root"><ChevronDown size={14} /><b>{manifest.name.toUpperCase()}</b></div>
          {project.sources.map((item) => <button key={item.path} className={`tree-file ${project.activePath === item.path ? "active" : ""}`} title={item.path} onClick={() => setActivePath(item.path)}><FileCode2 size={15} /><span>{fileName(item.path)}</span>{isProjectSourceDirty(project, item.path) && <i>M</i>}</button>)}
          <button className={`tree-file ${activeIsConstraints ? "active" : ""}`} onClick={() => setActivePath(constraintsPath)}><FileCode2 size={15} /><span>{constraintsPath}</span><em>generated</em></button>
          <div className="files-footer"><div><span>TOP ENTITY</span><strong>{topEntity}</strong></div></div>
        </>}
      </aside>
      <div className="resize-handle vertical explorer-handle" title="Drag to resize explorer. Double-click to reset." onPointerDown={(event) => startResize("explorer", event)} onDoubleClick={() => resetPane("explorer")} />

      <EditorPanel
        tabs={editorTabs}
        activePath={project.activePath}
        activeFileName={activeFileName}
        activeContent={activeContent}
        readOnly={activeIsConstraints}
        onSelect={setActivePath}
        onChange={updateActiveContent}
      />
      <div className="resize-handle vertical editor-handle" title="Drag to resize editor. Double-click to reset." onPointerDown={(event) => startResize("editor", event)} onDoubleClick={() => resetPane("editor")} />

      <section className="board-panel">
        <div className="section-title"><div><span>INTERACTIVE BOARD</span><small>Right-click a block for vector mapping, or a pin/segment for granular mapping</small></div></div>
        <BoardView
          board={selectedBoard}
          expandedAssignments={expandedAssignments}
          assignmentEnabled={simState !== "running"}
          value={endpointValue}
          onContext={handleBoardContext}
          onInput={handleBoardInput}
        />
        <div className="board-tip"><Unplug size={15} /><span><b>{expandedAssignments.length} physical pins assigned</b> - generated Quartus constraints update automatically.</span></div>
      </section>
      <div className="resize-handle vertical inspector-handle" title="Drag to resize inspector. Double-click to reset." onPointerDown={(event) => startResize("inspector", event)} onDoubleClick={() => resetPane("inspector")} />

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
        onClear={clearAssignment}
      />
      <div className="resize-handle horizontal bottom-handle" title="Drag to resize waveform panel. Double-click to reset." onPointerDown={(event) => startResize("bottom", event)} onDoubleClick={() => resetPane("bottom")} />

      <section className="bottom-panel">
        <div className="bottom-tabs"><button className="collapse-button" title={collapsed.bottom ? "Expand bottom panel" : "Collapse bottom panel"} onClick={() => togglePane("bottom")}>{collapsed.bottom ? "⌃" : "⌄"}</button><button className={bottomTab === "waveform" ? "active" : ""} onClick={() => setBottomTab("waveform")}><Activity size={14} />Sample</button><button className={bottomTab === "compilation" ? "active" : ""} onClick={() => setBottomTab("compilation")}><TerminalSquare size={14} />Compilation</button><button className={bottomTab === "problems" ? "active" : ""} onClick={() => setBottomTab("problems")}><Info size={14} />Problems <i>{problems.length}</i></button><span /> <small>{waveform.length ? `${timeRef.current} ns` : "No capture"}</small></div>
        {!collapsed.bottom && (bottomTab === "waveform"
          ? <Waveform samples={waveform} assignments={expandedAssignments} />
          : bottomTab === "compilation"
            ? <LogPanel lines={compilationLog} empty="No compilation yet. Press Run to analyze and start simulation." />
            : <LogPanel lines={problems} empty="No problems reported." problem />)}
      </section>
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
      onClear={clearAssignment}
    />}
    {projectDialog === "new" && <NewProjectDialog
      templates={projectTemplates}
      onCancel={() => setProjectDialog(null)}
      onOpen={() => { setProjectDialog(null); void openExistingProject(); }}
      onCreate={(name, folderName, templateId) => void createNewProject(name, folderName, templateId)}
    />}
    {projectDialog === "settings" && <ProjectSettingsDialog
      name={manifest.name}
      boardId={manifest.boardId}
      topEntity={manifest.topEntity}
      boards={boards}
      entityNames={entityNames}
      onCancel={() => setProjectDialog(null)}
      onSave={(settings) => { setManifest(settings); reset(); setProjectDialog(null); }}
    />}
    {unsavedOpen && <UnsavedChangesDialog
      projectName={manifest.name}
      onSave={() => void continuePendingAction(true)}
      onDiscard={() => void continuePendingAction(false)}
      onCancel={() => { pendingProjectActionRef.current = null; setUnsavedOpen(false); }}
    />}
  </div>;
}
