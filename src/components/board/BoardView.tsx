import { memo, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { PointerEvent as ReactPointerEvent } from "react";
import { Cpu } from "lucide-react";
import { endpointSort, groupSort } from "../../board";
import { assignmentStatus } from "../../assignments/model";
import type { BoardDefinition, BoardEndpoint, BoardGroup, ExpandedAssignment, MappingTarget } from "../../types";
import { useI18n } from "../../i18n";
import { placeTooltip, type Point } from "./tooltipPlacement";

type BoardViewProps = {
  board: BoardDefinition;
  expandedAssignments: ExpandedAssignment[];
  assignmentEnabled: boolean;
  value: (endpoint: BoardEndpoint) => boolean;
  onContext: (target: MappingTarget, event: React.MouseEvent) => void;
  onInput: (endpoint: BoardEndpoint, next: boolean) => void;
};

type TooltipState = { text: string; x: number; y: number } | null;
type TooltipHandlers = {
  onMouseEnter: (event: React.MouseEvent) => void;
  onMouseMove: (event: React.MouseEvent) => void;
  onMouseLeave: () => void;
};

const tooltipHandlers = (text: string, setTooltip: (tooltip: TooltipState) => void): TooltipHandlers => ({
  onMouseEnter: (event) => {
    event.stopPropagation();
    setTooltip({ text, x: event.clientX, y: event.clientY });
  },
  onMouseMove: (event) => {
    event.stopPropagation();
    setTooltip({ text, x: event.clientX, y: event.clientY });
  },
  onMouseLeave: () => setTooltip(null)
});

export const BoardView = memo(function BoardView({ board, expandedAssignments, assignmentEnabled, value, onContext, onInput }: BoardViewProps) {
  const { t } = useI18n();
  const [tooltip, setTooltip] = useState<TooltipState>(null);
  const [tooltipPosition, setTooltipPosition] = useState<Point | null>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const assignmentByEndpoint = new Map(expandedAssignments.map((assignment) => [assignment.endpointId, assignment]));
  const assignedEndpointIds = new Set(assignmentByEndpoint.keys());
  const sortedGroups = [...board.groups].sort(groupSort);
  const displayGroups = sortedGroups.filter((group) => group.kind === "seven-segment");
  const deviceGroups = sortedGroups.filter((group) => group.kind !== "seven-segment");

  useLayoutEffect(() => {
    if (!tooltip) {
      setTooltipPosition(null);
      return;
    }
    const update = () => {
      const element = tooltipRef.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      setTooltipPosition(placeTooltip(tooltip, rect, { width: window.innerWidth, height: window.innerHeight }));
    };
    update();
    window.addEventListener("resize", update);
    window.addEventListener("scroll", update, true);
    return () => {
      window.removeEventListener("resize", update);
      window.removeEventListener("scroll", update, true);
    };
  }, [tooltip]);

  useEffect(() => {
    if (!assignmentEnabled) setTooltip(null);
  }, [assignmentEnabled]);

  return <div className={`board-shell ${assignmentEnabled ? "" : "simulation-running"}`}>
    <div className="board-canvas">
      <div className="schematic-header"><div><b>{board.device}</b><span>{t("board.schematic")}</span><small>{t("board.instructions")}</small></div><Cpu size={36} /></div>
      <div className="board-grid">
        {displayGroups.length > 0 && <HexDisplayCluster
          groups={displayGroups}
          expandedAssignments={expandedAssignments}
          assignmentByEndpoint={assignmentByEndpoint}
          assignmentEnabled={assignmentEnabled}
          setTooltip={setTooltip}
          value={value}
          onContext={onContext}
        />}
        {deviceGroups.map((group) => <DeviceGroup
          key={group.id}
          group={group}
          status={assignmentStatus(group, expandedAssignments)}
          assignedEndpointIds={assignedEndpointIds}
          assignmentByEndpoint={assignmentByEndpoint}
          assignmentEnabled={assignmentEnabled}
          setTooltip={setTooltip}
          value={value}
          onContext={onContext}
          onInput={onInput}
        />)}
      </div>
    </div>
    {tooltip && createPortal(<div
      ref={tooltipRef}
      className="board-tooltip"
      style={{ left: tooltipPosition?.x ?? 0, top: tooltipPosition?.y ?? 0, visibility: tooltipPosition ? "visible" : "hidden" }}
    >{tooltip.text}</div>, document.body)}
  </div>;
});

function DeviceGroup({ group, status, assignedEndpointIds, assignmentByEndpoint, assignmentEnabled, setTooltip, value, onContext, onInput }: {
  group: BoardGroup;
  status: string;
  assignedEndpointIds: Set<string>;
  assignmentByEndpoint: Map<string, ExpandedAssignment>;
  assignmentEnabled: boolean;
  setTooltip: (tooltip: TooltipState) => void;
  value: (endpoint: BoardEndpoint) => boolean;
  onContext: (target: MappingTarget, event: React.MouseEvent) => void;
  onInput: (endpoint: BoardEndpoint, next: boolean) => void;
}) {
  const { t } = useI18n();
  const vectorContext = (event: React.MouseEvent) => {
    if (!assignmentEnabled) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (group.vectorName) {
      event.preventDefault();
      event.stopPropagation();
      onContext({ mode: "vector", endpointId: group.id }, event);
    }
  };
  const vectorTooltip = assignmentEnabled && group.vectorName ? t("board.mapVector") : null;
  return <section className={`board-section ${group.kind} ${status}`} onContextMenu={vectorContext} {...(vectorTooltip ? tooltipHandlers(vectorTooltip, setTooltip) : {})}>
    <h3>
      <button type="button" className="group-vector-target" onContextMenu={vectorContext} {...(vectorTooltip ? tooltipHandlers(vectorTooltip, setTooltip) : {})}>
        {t(`board.group.${group.id}`)}
      </button>
    </h3>
    <div className={group.kind === "seven-segment" ? "display-row" : "device-row"} data-count={group.children.length}>
      {group.kind === "seven-segment"
        ? <SevenSegmentGroup group={group} status={status} assignmentByEndpoint={assignmentByEndpoint} assignmentEnabled={assignmentEnabled} setTooltip={setTooltip} value={value} onContext={onContext} />
        : [...group.children].sort(endpointSort).map((endpoint) => <BoardDevice
          key={endpoint.id}
          endpoint={endpoint}
          mapped={assignedEndpointIds.has(endpoint.id)}
          assignment={assignmentByEndpoint.get(endpoint.id)}
          on={value(endpoint)}
          assignmentEnabled={assignmentEnabled}
          setTooltip={setTooltip}
          onContext={onContext}
          onInput={onInput}
        />)}
    </div>
  </section>;
}

function HexDisplayCluster({ groups, expandedAssignments, assignmentByEndpoint, assignmentEnabled, setTooltip, value, onContext }: {
  groups: BoardGroup[];
  expandedAssignments: ExpandedAssignment[];
  assignmentByEndpoint: Map<string, ExpandedAssignment>;
  assignmentEnabled: boolean;
  setTooltip: (tooltip: TooltipState) => void;
  value: (endpoint: BoardEndpoint) => boolean;
  onContext: (target: MappingTarget, event: React.MouseEvent) => void;
}) {
  const { t } = useI18n();
  return <section className="board-section seven-segment hex-cluster">
    <h3>{t("board.group.HEXES")}</h3>
    <div className="display-row">
      {groups.map((group) => {
        const status = assignmentStatus(group, expandedAssignments);
        const vectorTooltip = assignmentEnabled ? t("board.mapVector") : null;
        const vectorContext = (event: React.MouseEvent) => {
          event.preventDefault();
          event.stopPropagation();
          if (assignmentEnabled) onContext({ mode: "vector", endpointId: group.id }, event);
        };
        return <div className={`hex-unit ${status}`} key={group.id}>
          <button type="button" className="hex-vector-target" onContextMenu={vectorContext} {...(vectorTooltip ? tooltipHandlers(vectorTooltip, setTooltip) : {})}>{group.id}</button>
          <SevenSegmentGroup group={group} status={status} assignmentByEndpoint={assignmentByEndpoint} assignmentEnabled={assignmentEnabled} setTooltip={setTooltip} value={value} onContext={onContext} />
        </div>;
      })}
    </div>
  </section>;
}

function BoardDevice({ endpoint, mapped, assignment, on, assignmentEnabled, setTooltip, onContext, onInput }: {
  endpoint: BoardEndpoint;
  mapped: boolean;
  assignment?: ExpandedAssignment;
  on: boolean;
  assignmentEnabled: boolean;
  setTooltip: (tooltip: TooltipState) => void;
  onContext: (target: MappingTarget, event: React.MouseEvent) => void;
  onInput: (endpoint: BoardEndpoint, next: boolean) => void;
}) {
  const { t } = useI18n();
  const physicalPin = endpoint.pin ? `PIN_${endpoint.pin}` : t("board.pinUnknown");
  const tooltip = assignmentEnabled
    ? assignment
      ? t("board.mapped", { label: endpoint.label, port: assignment.portId, pin: physicalPin, instruction: t("board.mapPin") })
      : t("board.unmapped", { label: endpoint.label, pin: physicalPin, instruction: t("board.mapPin") })
    : null;
  const common = {
    onContextMenu: (event: React.MouseEvent) => {
      event.preventDefault();
      event.stopPropagation();
      if (!assignmentEnabled) return;
      onContext({ mode: "granular", endpointId: endpoint.id }, event);
    },
    ...(tooltip ? tooltipHandlers(tooltip, setTooltip) : {})
  };
  const label = endpoint.displayLabel ?? endpoint.label;

  if (endpoint.kind === "switch") {
    return <button type="button" {...common} className={`toggle ${on ? "on" : ""} ${mapped ? "mapped" : ""}`} onClick={() => onInput(endpoint, !on)}><i /><span>{label}</span></button>;
  }

  if (endpoint.kind === "button") {
    const press = (event: ReactPointerEvent<HTMLButtonElement>) => {
      event.currentTarget.setPointerCapture(event.pointerId);
      onInput(endpoint, false);
    };
    const release = (event: ReactPointerEvent<HTMLButtonElement>) => {
      if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
      onInput(endpoint, true);
    };
    return <button type="button" {...common} className={`push ${mapped ? "mapped" : ""}`} onPointerDown={press} onPointerUp={release} onPointerCancel={release}><i /><span>{label}</span></button>;
  }

  if (endpoint.kind === "clock") {
    return <button type="button" {...common} className={`clock-chip ${mapped ? "mapped" : ""} ${assignmentEnabled ? "" : "readonly-output"}`}>{endpoint.label.replace("CLOCK_", "")}<span>MHz</span></button>;
  }

  return <button type="button" {...common} className={`led-unit ${on ? "on" : ""} ${endpoint.kind.includes("green") ? "green" : "red"} ${mapped ? "mapped" : ""} ${assignmentEnabled ? "" : "readonly-output"}`}><i /><span>{label}</span></button>;
}

function SevenSegmentGroup({ group, status, assignmentByEndpoint, assignmentEnabled, setTooltip, value, onContext }: {
  group: BoardGroup;
  status: string;
  assignmentByEndpoint: Map<string, ExpandedAssignment>;
  assignmentEnabled: boolean;
  setTooltip: (tooltip: TooltipState) => void;
  value: (endpoint: BoardEndpoint) => boolean;
  onContext: (target: MappingTarget, event: React.MouseEvent) => void;
}) {
  const { t } = useI18n();
  const active = group.children.some((endpoint) => value(endpoint));
  const displayTooltip = assignmentEnabled ? t("board.mapVector") : null;
  return <div
    className={`seven-display ${status} ${active ? "on" : ""} ${assignmentEnabled ? "" : "readonly-output"}`}
    role="button"
    tabIndex={0}
    {...(displayTooltip ? tooltipHandlers(displayTooltip, setTooltip) : {})}
    onContextMenu={(event) => {
      event.preventDefault();
      event.stopPropagation();
      if (!assignmentEnabled) return;
      onContext({ mode: "vector", endpointId: group.id }, event);
    }}
  >
    <div className="seven-face">
      {[...group.children].sort(endpointSort).map((endpoint) => <span
        key={endpoint.id}
        className={`seg ${endpoint.segment ?? ""} ${value(endpoint) ? "on" : ""}`}
        {...(assignmentEnabled ? tooltipHandlers(assignmentByEndpoint.get(endpoint.id)
          ? t("board.mapped", { label: endpoint.label, port: assignmentByEndpoint.get(endpoint.id)!.portId, pin: endpoint.pin ? `PIN_${endpoint.pin}` : t("board.pinUnknown"), instruction: t("board.mapPin") })
          : t("board.unmapped", { label: endpoint.label, pin: endpoint.pin ? `PIN_${endpoint.pin}` : t("board.pinUnknown"), instruction: t("board.mapPin") }), setTooltip) : {})}
        onContextMenu={(event) => {
          event.preventDefault();
          event.stopPropagation();
          if (!assignmentEnabled) return;
          onContext({ mode: "granular", endpointId: endpoint.id }, event);
        }}
      />)}
    </div>
  </div>;
}
