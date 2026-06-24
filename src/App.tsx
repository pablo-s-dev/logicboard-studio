import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, PointerEvent as ReactPointerEvent } from "react";
import {
  Activity, ChevronDown, CircleStop, Cpu, FileCode2, FolderOpen, Gauge,
  Info, Play, RotateCcw, Save, Search, Settings2, TerminalSquare,
  Trash2, Unplug
} from "lucide-react";
import { boards, cycloneII } from "./board";
import type { Assignment, BoardEndpoint, EntityPort, WaveSample } from "./types";
import { parseEntityName, parseEntityPorts, previewOutputs } from "./vhdl";

const starterVhdl = `library ieee;
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

const initialAssignments: Assignment[] = [
  ...Array.from({ length: 10 }, (_, i) => ({ endpointId: `SW${i}`, portId: `SW[${i}]` })),
  ...Array.from({ length: 10 }, (_, i) => ({ endpointId: `LEDR${i}`, portId: `LEDR[${i}]` })),
  ...Array.from({ length: 4 }, (_, i) => ({ endpointId: `KEY${i}`, portId: `KEY[${i}]` })),
  { endpointId: "LEDG0", portId: "LEDG[0]" },
  { endpointId: "LEDG1", portId: "LEDG[1]" },
  { endpointId: "CLOCK_50", portId: "CLOCK_50" }
];

type ActiveFile = "source" | "constraints";
type ContextState = { endpoint: BoardEndpoint; x: number; y: number } | null;
type InspectorView = "assignments" | "ports";
type PaneSizes = { explorer: number; editor: number; inspector: number; bottom: number };
type CollapsedPanes = { explorer: boolean; inspector: boolean; bottom: boolean };
type ResizeKind = keyof PaneSizes;
type SimState = "stopped" | "running";
type BottomTab = "waveform" | "compilation" | "problems";
type SimulationResult = { outputs: Record<string, boolean>; diagnostics: string[] };

const defaultPaneSizes: PaneSizes = { explorer: 185, editor: 350, inspector: 260, bottom: 170 };
const defaultCollapsed: CollapsedPanes = { explorer: false, inspector: false, bottom: false };
const emptyPortValues: Record<string, boolean> = {};
const paneLimits: Record<ResizeKind, [number, number]> = {
  explorer: [132, 310],
  editor: [280, 620],
  inspector: [220, 430],
  bottom: [96, 330]
};

const loadStored = <T,>(key: string, fallback: T): T => {
  try { return JSON.parse(localStorage.getItem(key) ?? "") as T; } catch { return fallback; }
};

const isTauriApp = () => "__TAURI_INTERNALS__" in window;
const clamp = (value: number, [min, max]: [number, number]) => Math.min(max, Math.max(min, value));

const endpointSort = (a: BoardEndpoint, b: BoardEndpoint) =>
  (a.displayOrder ?? 0) - (b.displayOrder ?? 0) || a.label.localeCompare(b.label);

const endpointBit = (endpoint: BoardEndpoint) => endpoint.displayLabel ?? endpoint.label;

const generatedConstraints = (
  assignments: Assignment[],
  boardName: string,
  boardDevice: string,
  endpoints: BoardEndpoint[],
  ports: EntityPort[],
  topEntity: string | null
) => {
  const endpointById = new Map(endpoints.map((endpoint) => [endpoint.id, endpoint]));
  const portById = new Map(ports.map((port) => [port.id, port]));
  const rows = assignments
    .flatMap((assignment) => {
      const endpoint = endpointById.get(assignment.endpointId);
      if (!endpoint) return [];
      return [{ assignment, endpoint, port: portById.get(assignment.portId) }];
    })
    .sort((a, b) => a.endpoint.group.localeCompare(b.endpoint.group) || endpointSort(a.endpoint, b.endpoint));

  const lines = [
    "-- LogicBoard Studio generated constraints",
    "-- This read-only view is derived from the current board assignments.",
    `-- Top entity: ${topEntity ?? "not found"}`,
    `-- Target board: ${boardName} (${boardDevice})`,
    "",
    "-- Endpoint        Pin       Dir   Entity port        VHDL type",
    "-- -------------------------------------------------------------"
  ];

  if (!rows.length) {
    lines.push("-- No assignments yet.");
  } else {
    for (const { assignment, endpoint, port } of rows) {
      lines.push(`-- ${endpoint.label.padEnd(15)} ${endpoint.pin.padEnd(9)} ${endpoint.direction.padEnd(5)} ${assignment.portId.padEnd(18)} ${port?.type ?? "unknown"}`);
    }
  }

  return `${lines.join("\n")}\n`;
};

export default function App() {
  const [source, setSource] = useState(() => localStorage.getItem("logicboard.source.v3") ?? starterVhdl);
  const [assignments, setAssignments] = useState<Assignment[]>(() => loadStored("logicboard.assignments.v3", initialAssignments));
  const [inputs, setInputs] = useState<Record<string, boolean>>({ KEY0: true, KEY1: true, KEY2: true, KEY3: true });
  const [simulatedOutputs, setSimulatedOutputs] = useState<Record<string, boolean> | null>(null);
  const [simState, setSimState] = useState<SimState>("stopped");
  const [speed, setSpeed] = useState(1);
  const [context, setContext] = useState<ContextState>(null);
  const [signalSearch, setSignalSearch] = useState("");
  const [inspectorView, setInspectorView] = useState<InspectorView>("assignments");
  const [inspectorSearch, setInspectorSearch] = useState("");
  const [activeFile, setActiveFile] = useState<ActiveFile>("source");
  const [bottomTab, setBottomTab] = useState<BottomTab>("waveform");
  const [selectedBoardId, setSelectedBoardId] = useState(cycloneII.id);
  const [paneSizes, setPaneSizes] = useState<PaneSizes>(() => loadStored("logicboard.paneSizes", defaultPaneSizes));
  const [collapsed, setCollapsed] = useState<CollapsedPanes>(() => loadStored("logicboard.collapsedPanes", defaultCollapsed));
  const [waveform, setWaveform] = useState<WaveSample[]>([]);
  const [problems, setProblems] = useState<string[]>([]);
  const [compilationLog, setCompilationLog] = useState<string[]>([]);
  const [isCompiling, setIsCompiling] = useState(false);
  const [isSimulating, setIsSimulating] = useState(false);
  const timeRef = useRef(0);
  const previousInputsRef = useRef(inputs);
  const topEntity = useMemo(() => parseEntityName(source), [source]);
  const selectedBoard = useMemo(() => boards.find((board) => board.id === selectedBoardId) ?? cycloneII, [selectedBoardId]);
  const ports = useMemo(() => parseEntityPorts(source), [source]);
  const constraints = useMemo(
    () => generatedConstraints(assignments, selectedBoard.name, selectedBoard.device, selectedBoard.endpoints, ports, topEntity),
    [assignments, ports, selectedBoard, topEntity]
  );

  const inputPortValues = useMemo(() => {
    const mapped: Record<string, boolean> = {};
    for (const assignment of assignments) {
      const endpoint = selectedBoard.endpoints.find((e) => e.id === assignment.endpointId);
      if (endpoint?.direction === "in") mapped[assignment.portId] = !!inputs[endpoint.id];
    }
    return mapped;
  }, [assignments, inputs, selectedBoard]);
  const portValues = simulatedOutputs ?? emptyPortValues;

  const endpointValue = useCallback((endpoint: BoardEndpoint) => {
    if (endpoint.direction === "in") return !!inputs[endpoint.id];
    const assignment = assignments.find((a) => a.endpointId === endpoint.id);
    return assignment ? !!portValues[assignment.portId] : false;
  }, [assignments, inputs, portValues]);

  useEffect(() => { localStorage.setItem("logicboard.source.v3", source); }, [source]);
  useEffect(() => { localStorage.setItem("logicboard.assignments.v3", JSON.stringify(assignments)); }, [assignments]);
  useEffect(() => { localStorage.setItem("logicboard.paneSizes", JSON.stringify(paneSizes)); }, [paneSizes]);
  useEffect(() => { localStorage.setItem("logicboard.collapsedPanes", JSON.stringify(collapsed)); }, [collapsed]);
  useEffect(() => {
    if (simState !== "running") return;
    const assignedEndpointIds = new Set(assignments.map((assignment) => assignment.endpointId));
    const timer = window.setInterval(() => {
      timeRef.current += 10;
      const values = Object.fromEntries(selectedBoard.endpoints.filter((e) => assignedEndpointIds.has(e.id)).map((e) => [e.id, endpointValue(e)]));
      setWaveform((old) => [...old.slice(-399), { time: timeRef.current, values }]);
    }, Math.max(40, 160 / speed));
    return () => window.clearInterval(timer);
  }, [assignments, endpointValue, selectedBoard.endpoints, simState, speed]);

  const reset = () => {
    setSimState("stopped");
    setInputs({ KEY0: true, KEY1: true, KEY2: true, KEY3: true });
    setSimulatedOutputs(null);
    setWaveform([]);
    timeRef.current = 0;
  };

  const assign = (endpointId: string, portId: string) => {
    setAssignments((old) => [...old.filter((a) => a.endpointId !== endpointId && a.portId !== portId), { endpointId, portId }]);
    setContext(null);
    setSignalSearch("");
  };

  const togglePane = (pane: keyof CollapsedPanes) => {
    setCollapsed((old) => ({ ...old, [pane]: !old[pane] }));
  };

  const resetPane = (kind: ResizeKind) => {
    setPaneSizes((old) => ({ ...old, [kind]: defaultPaneSizes[kind] }));
  };

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
    const values = Object.fromEntries(selectedBoard.endpoints.filter((e) => assignments.some((a) => a.endpointId === e.id)).map((endpoint) => {
      if (endpoint.direction === "in") return [endpoint.id, !!inputs[endpoint.id]];
      const assignment = assignments.find((item) => item.endpointId === endpoint.id);
      return [endpoint.id, assignment ? !!outputs[assignment.portId] : false];
    }));
    setWaveform((old) => [...old.slice(-399), { time: timeRef.current, values }]);
  }, [assignments, inputs, selectedBoard]);

  const validateProject = useCallback(() => {
    const localProblems: string[] = [];
    if (!topEntity) localProblems.push("No VHDL entity declaration found.");
    if (!ports.length) localProblems.push("The top entity has no supported in/out ports.");
    return localProblems;
  }, [ports.length, topEntity]);

  const compileProject = useCallback(async () => {
    setIsCompiling(true);
    setProblems([]);
    setCompilationLog(["Starting analysis..."]);
    setBottomTab("compilation");

    const localProblems = validateProject();
    if (localProblems.length) {
      setProblems(localProblems);
      setCompilationLog(["Analysis blocked. See Problems for details."]);
      setBottomTab("problems");
      setIsCompiling(false);
      return false;
    }

    try {
      if (!isTauriApp()) {
        setCompilationLog(["Preview analysis passed. GHDL analysis runs in the Tauri desktop app."]);
        return true;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<string[]>("analyze_project", { sources: [{ name: "board_demo.vhd", content: source }] });
      setCompilationLog(result.length ? result : ["GHDL analysis completed successfully."]);
      return true;
    } catch (error) {
      setProblems([String(error)]);
      setCompilationLog(["GHDL analysis failed. See Problems for details."]);
      setBottomTab("problems");
      return false;
    } finally {
      setIsCompiling(false);
    }
  }, [source, validateProject]);

  const stopSimulation = useCallback(() => {
    setSimState("stopped");
    setSimulatedOutputs(null);
  }, []);

  const runSimulation = useCallback(async () => {
    const canRun = await compileProject();
    if (!canRun) return;

    setIsSimulating(true);
    try {
      if (!isTauriApp()) {
        const previewValues = previewOutputs(source, inputPortValues, ports);
        setSimulatedOutputs(previewValues);
        setProblems([]);
        setSimState("running");
        setBottomTab("waveform");
        appendWaveSample(previewValues);
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<SimulationResult>("simulate_project", {
        sources: [{ name: "board_demo.vhd", content: source }],
        topEntity,
        ports,
        inputs: inputPortValues
      });
      setSimulatedOutputs(result.outputs);
      setProblems([]);
      setCompilationLog((old) => [
        ...old,
        "",
        ...(result.diagnostics.length ? result.diagnostics : ["GHDL simulation completed successfully."])
      ]);
      setSimState("running");
      setBottomTab("waveform");
      appendWaveSample(result.outputs);
    } catch (error) {
      setProblems([String(error)]);
      setBottomTab("problems");
      setSimState("stopped");
    } finally { setIsSimulating(false); }
  }, [appendWaveSample, compileProject, inputPortValues, ports, source, topEntity]);

  const updateRunningSimulation = useCallback(async () => {
    try {
      if (!isTauriApp()) {
        const previewValues = previewOutputs(source, inputPortValues, ports);
        setSimulatedOutputs(previewValues);
        setProblems([]);
        appendWaveSample(previewValues);
        return;
      }
      const { invoke } = await import("@tauri-apps/api/core");
      const result = await invoke<SimulationResult>("simulate_project", {
        sources: [{ name: "board_demo.vhd", content: source }],
        topEntity,
        ports,
        inputs: inputPortValues
      });
      setSimulatedOutputs(result.outputs);
      setProblems([]);
      setCompilationLog((old) => result.diagnostics.length ? [...old, "", ...result.diagnostics] : old);
      appendWaveSample(result.outputs);
    } catch (error) {
      setProblems([String(error)]);
      setBottomTab("problems");
      setSimState("stopped");
    }
  }, [appendWaveSample, inputPortValues, ports, source, topEntity]);

  const handleBoardContext = useCallback((endpoint: BoardEndpoint, event: React.MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
    setContext({ endpoint, x: event.clientX, y: event.clientY });
    setSignalSearch("");
  }, []);

  const handleBoardInput = useCallback((endpoint: BoardEndpoint, next: boolean) => {
    setInputs((old) => old[endpoint.id] === next ? old : { ...old, [endpoint.id]: next });
  }, []);

  useEffect(() => {
    setSimulatedOutputs(null);
    setSimState("stopped");
  }, [source, assignments]);
  useEffect(() => {
    if (previousInputsRef.current === inputs) return;
    previousInputsRef.current = inputs;
    if (simState === "running") void updateRunningSimulation();
  }, [inputs, simState, updateRunningSimulation]);

  const compatiblePorts = context ? ports.filter((port) => port.direction === context.endpoint.direction && port.id.toLowerCase().includes(signalSearch.toLowerCase())) : [];
  const assignedEndpointIds = new Set(assignments.map((assignment) => assignment.endpointId));
  const mappedCount = assignments.length;
  const activeContent = activeFile === "source" ? source : constraints;
  const activeFileName = activeFile === "source" ? "board_demo.vhd" : "constraints.vhd";
  const filteredAssignments = assignments.filter((assignment) => {
    const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment.endpointId);
    const haystack = `${assignment.portId} ${endpoint?.label ?? ""} ${endpoint?.pin ?? ""}`.toLowerCase();
    return haystack.includes(inspectorSearch.toLowerCase());
  });
  const filteredPorts = ports.filter((port) => {
    const assignment = assignments.find((item) => item.portId === port.id);
    const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment?.endpointId);
    const haystack = `${port.id} ${port.type} ${port.direction} ${endpoint?.label ?? ""}`.toLowerCase();
    return haystack.includes(inspectorSearch.toLowerCase());
  });
  const workspaceStyle = {
    "--explorer-width": `${collapsed.explorer ? 34 : paneSizes.explorer}px`,
    "--editor-width": `${paneSizes.editor}px`,
    "--inspector-width": `${collapsed.inspector ? 34 : paneSizes.inspector}px`,
    "--bottom-height": `${collapsed.bottom ? 34 : paneSizes.bottom}px`
  } as CSSProperties;
  const isRunBusy = isCompiling || isSimulating;
  const statusLabel = isCompiling ? "Compiling" : isSimulating ? "Starting" : simState === "stopped" ? "Ready" : "Running";

  return <div className="app" onClick={() => context && setContext(null)}>
    <header className="topbar">
      <div className="brand"><div className="brand-mark"><Activity size={19} /></div><strong>LogicBoard</strong><span>STUDIO</span></div>
      <button className="project-button" disabled title="Project switching is not implemented yet"><FolderOpen size={16} /><div><small>PROJECT</small><b>board-demo</b></div><ChevronDown size={14} /></button>
      <div className="top-spacer" />
      <div className={`status ${isCompiling ? "compiling" : simState}`}><i />{statusLabel}</div>
      <button className="icon-button" disabled title="Save is not implemented yet"><Save size={17} /></button>
      <button className="icon-button" disabled title="Settings are not implemented yet"><Settings2 size={17} /></button>
    </header>

    <div className="toolbar">
      <label className="board-select">
        <Cpu size={16} />
        <span>
          <small>TARGET BOARD</small>
          <select
            value={selectedBoardId}
            onChange={(event) => {
              setSelectedBoardId(event.target.value);
              reset();
            }}
            title={boards.length === 1 ? "Only EP2C20F484C7 is available right now" : "Changing boards resets the simulation"}
          >
            {boards.map((board) => <option key={board.id} value={board.id}>{board.name} - {board.device}</option>)}
          </select>
        </span>
      </label>
      <div className="device-chip">{selectedBoard.device}</div>
      <div className="toolbar-spacer" />
      <button className={`control ${simState === "running" ? "quiet" : ""}`} disabled={simState !== "running" && isRunBusy} onClick={() => simState === "running" ? stopSimulation() : void runSimulation()}>
        {simState === "running" ? <CircleStop size={16} /> : <Play size={16} fill="currentColor" />}{simState === "running" ? "Stop" : isCompiling ? "Compiling..." : isSimulating ? "Starting..." : "Run"}
      </button>
      <button className="icon-button" onClick={reset} title="Reset simulation"><RotateCcw size={16} /></button>
      <label className="speed"><Gauge size={15} /><select value={speed} onChange={(e) => setSpeed(Number(e.target.value))}><option value={0.5}>0.5x</option><option value={1}>1x</option><option value={2}>2x</option><option value={4}>4x</option></select></label>
    </div>

    <main className={`workspace ${collapsed.explorer ? "explorer-collapsed" : ""} ${collapsed.inspector ? "inspector-collapsed" : ""} ${collapsed.bottom ? "bottom-collapsed" : ""}`} style={workspaceStyle}>
      <aside className="files-panel">
        <div className="panel-heading"><span>EXPLORER</span><button className="collapse-button" title="Collapse explorer" onClick={() => togglePane("explorer")}>‹</button></div>
        {collapsed.explorer ? <button className="panel-rail" title="Expand explorer" onClick={() => togglePane("explorer")}><FileCode2 size={15} /><span>Files</span></button> : <>
          <div className="tree-root"><ChevronDown size={14} /><b>BOARD-DEMO</b></div>
          <button className={`tree-file ${activeFile === "source" ? "active" : ""}`} onClick={() => setActiveFile("source")}><FileCode2 size={15} /><span>board_demo.vhd</span><i>M</i></button>
          <button className={`tree-file ${activeFile === "constraints" ? "active" : ""}`} onClick={() => setActiveFile("constraints")}><FileCode2 size={15} /><span>constraints.vhd</span><em>generated</em></button>
          <div className="files-footer"><div><span>TOP ENTITY</span><strong>{topEntity ?? "not found"}</strong></div></div>
        </>}
      </aside>
      <div className="resize-handle vertical explorer-handle" title="Drag to resize explorer. Double-click to reset." onPointerDown={(event) => startResize("explorer", event)} onDoubleClick={() => resetPane("explorer")} />

      <section className="editor-panel">
        <div className="editor-tabs"><div className="editor-tab active"><FileCode2 size={14} />{activeFileName}{activeFile === "source" ? <span>*</span> : <em>read-only</em>}</div></div>
        <div className={`editor-wrap ${activeFile === "constraints" ? "read-only" : ""}`}>
          <div className="line-numbers">{activeContent.split("\n").map((_, i) => <span key={i}>{i + 1}</span>)}</div>
          <textarea
            spellCheck={false}
            value={activeContent}
            readOnly={activeFile === "constraints"}
            onChange={(e) => activeFile === "source" && setSource(e.target.value)}
            aria-label={activeFile === "source" ? "VHDL source editor" : "Generated constraints view"}
          />
        </div>
      </section>
      <div className="resize-handle vertical editor-handle" title="Drag to resize editor. Double-click to reset." onPointerDown={(event) => startResize("editor", event)} onDoubleClick={() => resetPane("editor")} />

      <section className="board-panel">
        <div className="section-title"><div><span>INTERACTIVE BOARD</span><small>Right-click any control or indicator to assign an entity port</small></div></div>
        <Board
          boardDevice={selectedBoard.device}
          endpoints={selectedBoard.endpoints}
          assignments={assignments}
          value={endpointValue}
          onContext={handleBoardContext}
          onInput={handleBoardInput}
        />
        <div className="board-tip"><Unplug size={15} /><span><b>{mappedCount} endpoints assigned</b> - generated constraints update automatically.</span></div>
      </section>
      <div className="resize-handle vertical inspector-handle" title="Drag to resize inspector. Double-click to reset." onPointerDown={(event) => startResize("inspector", event)} onDoubleClick={() => resetPane("inspector")} />

      <aside className="inspector">
        <div className="inspector-tabs"><button className="collapse-button" title={collapsed.inspector ? "Expand inspector" : "Collapse inspector"} onClick={() => togglePane("inspector")}>{collapsed.inspector ? "‹" : "›"}</button>{!collapsed.inspector && <><button className={inspectorView === "assignments" ? "active" : ""} onClick={() => setInspectorView("assignments")}>Assignments</button><button className={inspectorView === "ports" ? "active" : ""} onClick={() => setInspectorView("ports")}>Ports</button></>}</div>
        {collapsed.inspector ? <button className="panel-rail" title="Expand inspector" onClick={() => togglePane("inspector")}><Search size={15} /><span>Inspector</span></button> : <>
          <div className="search"><Search size={14} /><input value={inspectorSearch} onChange={(e) => setInspectorSearch(e.target.value)} placeholder={inspectorView === "assignments" ? "Filter assignments" : "Filter entity ports"} /></div>
          <div className="assignment-summary"><span>{inspectorView === "assignments" ? "ASSIGNED ENDPOINTS" : "ENTITY PORTS"}</span><b>{inspectorView === "assignments" ? `${mappedCount} / ${selectedBoard.endpoints.length}` : ports.length}</b></div>
          <div className="assignment-list">
            {inspectorView === "assignments" ? filteredAssignments.map((assignment) => {
              const endpoint = selectedBoard.endpoints.find((e) => e.id === assignment.endpointId);
              const port = ports.find((p) => p.id === assignment.portId);
              if (!endpoint) return null;
              return <div className="assignment-row" key={`${assignment.endpointId}-${assignment.portId}`}>
                <div className={`direction ${port?.direction ?? endpoint.direction}`}>{(port?.direction ?? endpoint.direction).toUpperCase()}</div>
                <div className="assignment-name"><b>{assignment.portId}</b><span>{endpoint.label} - PIN_{endpoint.pin}</span></div>
                <button title={`Remove ${assignment.portId}`} onClick={() => setAssignments((old) => old.filter((a) => a.endpointId !== endpoint.id))}><Trash2 size={13} /></button>
              </div>;
            }) : filteredPorts.map((port) => {
              const assignment = assignments.find((item) => item.portId === port.id);
              const endpoint = selectedBoard.endpoints.find((item) => item.id === assignment?.endpointId);
              return <div className="assignment-row port-row" key={port.id}>
                <div className={`direction ${port.direction}`}>{port.direction.toUpperCase()}</div>
                <div className="assignment-name"><b>{port.id}</b><span>{port.type}</span></div>
                <div className={endpoint ? "port-map mapped-text" : "port-map"}>{endpoint ? `${endpoint.label} PIN_${endpoint.pin}` : "not mapped"}</div>
              </div>;
            })}
          </div>
        </>}
      </aside>
      <div className="resize-handle horizontal bottom-handle" title="Drag to resize waveform panel. Double-click to reset." onPointerDown={(event) => startResize("bottom", event)} onDoubleClick={() => resetPane("bottom")} />

      <section className="bottom-panel">
        <div className="bottom-tabs"><button className="collapse-button" title={collapsed.bottom ? "Expand bottom panel" : "Collapse bottom panel"} onClick={() => togglePane("bottom")}>{collapsed.bottom ? "⌃" : "⌄"}</button><button className={bottomTab === "waveform" ? "active" : ""} onClick={() => setBottomTab("waveform")}><Activity size={14} />Waveform</button><button className={bottomTab === "compilation" ? "active" : ""} onClick={() => setBottomTab("compilation")}><TerminalSquare size={14} />Compilation</button><button className={bottomTab === "problems" ? "active" : ""} onClick={() => setBottomTab("problems")}><Info size={14} />Problems <i>{problems.length}</i></button><span /> <small>{waveform.length ? `${timeRef.current} ns` : "No capture"}</small></div>
        {!collapsed.bottom && (bottomTab === "waveform"
          ? <Waveform samples={waveform} assignments={assignments} />
          : bottomTab === "compilation"
            ? <LogPanel lines={compilationLog} empty="No compilation yet. Press Run to analyze and start simulation." />
            : <LogPanel lines={problems} empty="No problems reported." problem />)}
      </section>
    </main>

    {context && <div className="context-menu" style={{ left: Math.min(context.x, window.innerWidth - 270), top: Math.min(context.y, window.innerHeight - 350) }} onClick={(e) => e.stopPropagation()}>
      <div className="context-title"><div><b>{context.endpoint.label}</b><span>PIN_{context.endpoint.pin} - {context.endpoint.direction.toUpperCase()}</span></div><span className="logic-value">{endpointValue(context.endpoint) ? "1" : "0"}</span></div>
      <div className="context-label">CHOOSE ENTITY PORT</div>
      <div className="context-search"><Search size={14} /><input autoFocus value={signalSearch} onChange={(e) => setSignalSearch(e.target.value)} placeholder="Search entity ports" /></div>
      <div className="context-options">{compatiblePorts.length ? compatiblePorts.map((port) => <button key={port.id} onClick={() => assign(context.endpoint.id, port.id)}><span className={`port-dot ${port.direction}`} /> <b>{port.id}</b><small>{port.type}</small>{assignedEndpointIds.has(context.endpoint.id) && assignments.find((a) => a.endpointId === context.endpoint?.id)?.portId === port.id && <em>current</em>}</button>) : <p>No compatible {context.endpoint.direction} ports</p>}</div>
      {assignments.some((a) => a.endpointId === context.endpoint.id) && <button className="clear-assignment" onClick={() => { setAssignments((old) => old.filter((a) => a.endpointId !== context.endpoint?.id)); setContext(null); }}><Trash2 size={13} />Clear assignment</button>}
    </div>}
  </div>;
}

type BoardProps = {
  boardDevice: string;
  endpoints: BoardEndpoint[];
  assignments: Assignment[];
  value: (e: BoardEndpoint) => boolean;
  onContext: (e: BoardEndpoint, event: React.MouseEvent) => void;
  onInput: (e: BoardEndpoint, next: boolean) => void;
};

const Board = memo(function Board({ boardDevice, endpoints, assignments, value, onContext, onInput }: BoardProps) {
  const group = (name: string) => endpoints.filter((e) => e.group === name).sort(endpointSort);
  const assigned = (id: string) => assignments.some((a) => a.endpointId === id);
  const common = (endpoint: BoardEndpoint) => ({
    onContextMenu: (ev: React.MouseEvent) => onContext(endpoint, ev),
    title: `${endpoint.label} - PIN_${endpoint.pin}`
  });

  return <div className="board-shell">
    <div className="board-canvas">
      <div className="schematic-header"><div><b>{boardDevice}</b><span>Functional board schematic</span></div><Cpu size={34} /></div>
      <div className="board-section hex-displays"><h3>Seven-segment displays</h3><div>{group("Seven-segment displays").map((endpoint) => <SevenSegment key={endpoint.id} endpoint={endpoint} mapped={assigned(endpoint.id)} on={value(endpoint)} onContext={onContext} />)}</div></div>
      <div className="board-section clocks"><h3>Clocks</h3><div>{group("Clocks").map((endpoint) => <button key={endpoint.id} {...common(endpoint)} className={`clock-chip ${assigned(endpoint.id) ? "mapped" : ""}`}>{endpoint.label.replace("CLOCK_", "")}<span>MHz</span></button>)}</div></div>
      <div className="board-section red-led-bank"><h3>Red LEDs</h3><div>{group("Red LEDs").map((endpoint) => <BoardDevice endpoint={endpoint} mapped={assigned(endpoint.id)} on={value(endpoint)} onContext={onContext} onInput={onInput} key={endpoint.id} />)}</div></div>
      <div className="board-section green-led-bank"><h3>Green LEDs</h3><div>{group("Green LEDs").map((endpoint) => <BoardDevice endpoint={endpoint} mapped={assigned(endpoint.id)} on={value(endpoint)} onContext={onContext} onInput={onInput} key={endpoint.id} />)}</div></div>
      <div className="board-section switch-bank"><h3>Switches</h3><div>{group("Toggle switches").map((endpoint) => <BoardDevice endpoint={endpoint} mapped={assigned(endpoint.id)} on={value(endpoint)} onContext={onContext} onInput={onInput} key={endpoint.id} />)}</div></div>
      <div className="board-section key-bank"><h3>Pushbuttons</h3><div>{group("Pushbuttons").map((endpoint) => <BoardDevice endpoint={endpoint} mapped={assigned(endpoint.id)} on={value(endpoint)} onContext={onContext} onInput={onInput} key={endpoint.id} />)}</div></div>
    </div>
  </div>;
});

function BoardDevice({ endpoint, mapped, on, onContext, onInput }: {
  endpoint: BoardEndpoint;
  mapped: boolean;
  on: boolean;
  onContext: (e: BoardEndpoint, event: React.MouseEvent) => void;
  onInput: (e: BoardEndpoint, next: boolean) => void;
}) {
  const common = {
    onContextMenu: (ev: React.MouseEvent) => onContext(endpoint, ev),
    title: `${endpoint.label} - PIN_${endpoint.pin}`
  };
  const label = endpointBit(endpoint);

  if (endpoint.kind === "switch") {
    return <button {...common} className={`toggle ${on ? "on" : ""} ${mapped ? "mapped" : ""}`} onClick={() => onInput(endpoint, !on)}><i /><span>{label}</span></button>;
  }

  if (endpoint.kind === "button") {
    const press = (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      onInput(endpoint, false);
    };
    const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      onInput(endpoint, true);
    };
    return <button {...common} className={`push ${mapped ? "mapped" : ""}`} onPointerDown={press} onPointerUp={release} onPointerCancel={release}><i /><span>{label}</span></button>;
  }

  return <button {...common} className={`led-unit ${on ? "on" : ""} ${endpoint.kind.includes("green") ? "green" : "red"} ${mapped ? "mapped" : ""}`}><i /><span>{label}</span></button>;
}

function SevenSegment({ endpoint, mapped, on, onContext }: {
  endpoint: BoardEndpoint;
  mapped: boolean;
  on: boolean;
  onContext: (e: BoardEndpoint, event: React.MouseEvent) => void;
}) {
  return <button title={`${endpoint.label} - PIN_${endpoint.pin}`} onContextMenu={(ev) => onContext(endpoint, ev)} className={`seven-display ${mapped ? "mapped" : ""} ${on ? "on" : ""}`}>
    <span className="seg a" /><span className="seg b" /><span className="seg c" /><span className="seg d" /><span className="seg e" /><span className="seg f" /><span className="seg g" />
    <small>{endpoint.label}</small>
  </button>;
}

function LogPanel({ lines, empty, problem = false }: { lines: string[]; empty: string; problem?: boolean }) {
  return <div className={`log-panel ${problem ? "problem-log" : ""}`}>
    {lines.length ? lines.map((line, index) => <div key={`${index}-${line}`}><Info size={14} />{line || "\u00a0"}</div>) : <p>{empty}</p>}
  </div>;
}

function Waveform({ samples, assignments }: { samples: WaveSample[]; assignments: Assignment[] }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = scrollRef.current;
    if (node) node.scrollLeft = node.scrollWidth;
  }, [samples.length]);
  if (!samples.length) return <div className="empty-wave"><Activity size={22} /><div><b>Waveform capture is ready</b><span>Run the simulation to capture mapped signals.</span></div></div>;

  const width = Math.max(700, (samples.length - 1) * 14);
  return <div className="waveform">
    <div className="wave-labels">{assignments.map((a) => <div key={a.endpointId}>{a.portId}</div>)}</div>
    <div className="wave-scroll" ref={scrollRef}>
      <div className="wave-traces" style={{ width }}>
        {assignments.map((a) => <svg key={a.endpointId} viewBox={`0 0 ${width} 24`} preserveAspectRatio="none"><polyline points={samples.map((s, i) => `${i * 14},${s.values[a.endpointId] ? 5 : 19}`).join(" ")} /></svg>)}
      </div>
    </div>
  </div>;
}
