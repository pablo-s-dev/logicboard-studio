import { Search, Trash2 } from "lucide-react";
import { compatibleGranularPorts, compatibleVectorPorts, findEndpoint, assignmentStatus } from "../../assignments/model";
import { endpointSort, groupSort } from "../../board";
import type { Assignment, BoardDefinition, EntityPort, ExpandedAssignment } from "../../types";

export type InspectorView = "assignments" | "ports" | "mapper";

type InspectorPanelProps = {
  board: BoardDefinition;
  ports: EntityPort[];
  assignments: Assignment[];
  expandedAssignments: ExpandedAssignment[];
  view: InspectorView;
  search: string;
  collapsed: boolean;
  onView: (view: InspectorView) => void;
  onSearch: (value: string) => void;
  onToggle: () => void;
  onAssign: (assignment: Assignment) => void;
  onClear: (targetId: string) => void;
};

export function InspectorPanel({
  board,
  ports,
  assignments,
  expandedAssignments,
  view,
  search,
  collapsed,
  onView,
  onSearch,
  onToggle,
  onAssign,
  onClear
}: InspectorPanelProps) {
  const term = search.toLowerCase();
  const mappedCount = expandedAssignments.length;

  return <aside className="inspector">
    <div className="inspector-tabs">
      <button className="collapse-button" title={collapsed ? "Expand inspector" : "Collapse inspector"} onClick={onToggle}>{collapsed ? "‹" : "›"}</button>
      {!collapsed && <>
        <button className={view === "assignments" ? "active" : ""} onClick={() => onView("assignments")}>Assignments</button>
        <button className={view === "ports" ? "active" : ""} onClick={() => onView("ports")}>Ports</button>
        <button className={view === "mapper" ? "active" : ""} onClick={() => onView("mapper")}>Mapper</button>
      </>}
    </div>
    {collapsed ? <button className="panel-rail" title="Expand inspector" onClick={onToggle}><Search size={15} /><span>Inspector</span></button> : <>
      <div className="search"><Search size={14} /><input value={search} onChange={(event) => onSearch(event.target.value)} placeholder={view === "mapper" ? "Filter endpoints or ports" : view === "assignments" ? "Filter assignments" : "Filter entity ports"} /></div>
      <div className="assignment-summary"><span>{view === "mapper" ? "BOARD MAPPER" : view === "assignments" ? "ASSIGNED PINS" : "ENTITY PORTS"}</span><b>{view === "ports" ? ports.length : `${mappedCount} / ${board.endpoints.length}`}</b></div>
      <div className="assignment-list">
        {view === "assignments" && <AssignmentsList board={board} expandedAssignments={expandedAssignments} term={term} onClear={onClear} />}
        {view === "ports" && <PortsList board={board} ports={ports} expandedAssignments={expandedAssignments} term={term} />}
        {view === "mapper" && <MapperList board={board} ports={ports} assignments={assignments} expandedAssignments={expandedAssignments} term={term} onAssign={onAssign} onClear={onClear} />}
      </div>
    </>}
  </aside>;
}

function AssignmentsList({ board, expandedAssignments, term, onClear }: {
  board: BoardDefinition;
  expandedAssignments: ExpandedAssignment[];
  term: string;
  onClear: (targetId: string) => void;
}) {
  const rows = expandedAssignments.filter((assignment) => `${assignment.portId} ${assignment.endpointLabel} ${assignment.pin ?? ""}`.toLowerCase().includes(term));
  if (!rows.length) return <p className="empty-list">No assignments found.</p>;
  return <>{rows.map((assignment) => {
    const endpoint = findEndpoint(board, assignment.endpointId);
    return <div className="assignment-row" key={`${assignment.assignmentId}-${assignment.endpointId}-${assignment.portId}`}>
      <div className={`direction ${assignment.direction}`}>{assignment.direction.toUpperCase()}</div>
      <div className="assignment-name"><b>{assignment.portId}</b><span>{assignment.endpointLabel} - {assignment.pin ? `PIN_${assignment.pin}` : "pin unknown"}</span></div>
      <button title={`Remove ${assignment.portId}`} onClick={() => onClear(endpoint?.id ?? assignment.endpointId)}><Trash2 size={13} /></button>
    </div>;
  })}</>;
}

function PortsList({ board, ports, expandedAssignments, term }: {
  board: BoardDefinition;
  ports: EntityPort[];
  expandedAssignments: ExpandedAssignment[];
  term: string;
}) {
  const rows = ports.filter((port) => `${port.id} ${port.type} ${port.direction}`.toLowerCase().includes(term));
  if (!rows.length) return <p className="empty-list">No ports found.</p>;
  return <>{rows.map((port) => {
    const assignment = expandedAssignments.find((item) => item.portId === port.id);
    const endpoint = assignment ? findEndpoint(board, assignment.endpointId) : undefined;
    return <div className="assignment-row port-row" key={port.id}>
      <div className={`direction ${port.direction}`}>{port.direction.toUpperCase()}</div>
      <div className="assignment-name"><b>{port.id}</b><span>{port.type}</span></div>
      <div className={endpoint ? "port-map mapped-text" : "port-map"}>{endpoint ? `${endpoint.label} ${endpoint.pin ? `PIN_${endpoint.pin}` : "pin unknown"}` : "not mapped"}</div>
    </div>;
  })}</>;
}

function MapperList({ board, ports, assignments, expandedAssignments, term, onAssign, onClear }: {
  board: BoardDefinition;
  ports: EntityPort[];
  assignments: Assignment[];
  expandedAssignments: ExpandedAssignment[];
  term: string;
  onAssign: (assignment: Assignment) => void;
  onClear: (targetId: string) => void;
}) {
  const groups = [...board.groups].sort(groupSort).filter((group) => `${group.label} ${group.vectorName ?? ""}`.toLowerCase().includes(term) || group.children.some((endpoint) => endpoint.label.toLowerCase().includes(term)));
  if (!groups.length) return <p className="empty-list">No board endpoints found.</p>;
  return <>{groups.map((group) => {
    const status = assignmentStatus(group, expandedAssignments);
    const vectorOptions = group.vectorName ? compatibleVectorPorts(group, ports, "") : [];
    const currentVector = assignments.find((assignment) => assignment.kind === "vector" && assignment.endpointId === group.id);
    return <div className="mapper-group" key={group.id}>
      <div className="mapper-group-title"><b>{group.label}</b><span className={`map-status ${status}`}>{status}</span></div>
      {group.vectorName && <div className="mapper-row">
        <span>Vector</span>
        <select value={currentVector?.portId ?? ""} onChange={(event) => event.target.value && onAssign({ id: `vector:${group.id}:${event.target.value}`, kind: "vector", endpointId: group.id, portId: event.target.value })}>
          <option value="">Choose compatible vector</option>
          {vectorOptions.map((port) => <option key={port.name} value={port.name}>{port.name} - {port.type}</option>)}
        </select>
        <button title="Clear vector assignment" onClick={() => onClear(group.id)}><Trash2 size={13} /></button>
      </div>}
      {[...group.children].sort(endpointSort).map((endpoint) => {
        const options = compatibleGranularPorts(endpoint, ports, "");
        const current = assignments.find((assignment) => assignment.kind === "granular" && assignment.endpointId === endpoint.id);
        const hidden = term && !`${endpoint.label} ${endpoint.pin ?? ""} ${current?.portId ?? ""}`.toLowerCase().includes(term);
        if (hidden) return null;
        return <div className="mapper-row child" key={endpoint.id}>
          <span>{endpoint.displayLabel ?? endpoint.label}</span>
          <select value={current?.portId ?? ""} onChange={(event) => event.target.value && onAssign({ id: `granular:${endpoint.id}:${event.target.value}`, kind: "granular", endpointId: endpoint.id, portId: event.target.value })}>
            <option value="">Choose port</option>
            {options.map((port) => <option key={port.id} value={port.id}>{port.id}</option>)}
          </select>
          <button title="Clear pin assignment" onClick={() => onClear(endpoint.id)}><Trash2 size={13} /></button>
        </div>;
      })}
    </div>;
  })}</>;
}
