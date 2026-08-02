import { Search, Trash2 } from "lucide-react";
import { compatibleGranularPorts, compatibleVectorPorts, findBoardGroup, findEndpoint } from "../../assignments/model";
import type { Assignment, BoardDefinition, BoardEndpoint, BoardGroup, EntityPort, MappingMode, MappingTarget } from "../../types";
import { useI18n } from "../../i18n";

type AssignmentMenuProps = {
  target: MappingTarget;
  x: number;
  y: number;
  board: BoardDefinition;
  ports: EntityPort[];
  assignments: Assignment[];
  mode: MappingMode;
  search: string;
  endpointValue: (endpoint: BoardEndpoint) => boolean;
  onMode: (mode: MappingMode) => void;
  onSearch: (value: string) => void;
  onAssign: (assignment: Assignment) => void;
  onClear: (targetId: string) => void;
};

const optionKey = (value: string) => value.replace(/\W+/g, "_");

export function AssignmentMenu({
  target,
  x,
  y,
  board,
  ports,
  assignments,
  mode,
  search,
  endpointValue,
  onMode,
  onSearch,
  onAssign,
  onClear
}: AssignmentMenuProps) {
  const { t } = useI18n();
  const group = findBoardGroup(board, target.endpointId);
  const endpoint = findEndpoint(board, target.endpointId);
  const activeGroup = group ?? (endpoint?.groupId ? findBoardGroup(board, endpoint.groupId) : undefined);
  const activeEndpoint = endpoint ?? group?.children[0];
  const canVector = !!activeGroup?.vectorName;
  const activeMode = canVector ? mode : "granular";
  const title = activeMode === "vector" && activeGroup ? t(`board.group.${activeGroup.id}`) : activeEndpoint?.label ?? target.endpointId;
  const detail = activeMode === "vector" && activeGroup
    ? `${t("mapping.pins", { count: activeGroup.width ?? activeGroup.children.length })} - ${activeGroup.direction.toUpperCase()}`
    : `${activeEndpoint?.pin ? `PIN_${activeEndpoint.pin}` : t("inspector.pinUnknown")} - ${activeEndpoint?.direction.toUpperCase() ?? ""}`;
  const currentValue = activeEndpoint ? endpointValue(activeEndpoint) : false;
  const hasAssignment = assignments.some((assignment) => assignment.endpointId === (activeMode === "vector" ? activeGroup?.id : activeEndpoint?.id));

  return <div className="context-menu" style={{ left: Math.min(x, window.innerWidth - 300), top: Math.min(y, window.innerHeight - 390) }} onClick={(event) => event.stopPropagation()}>
    <div className="context-title"><div><b>{title}</b><span>{detail}</span></div><span className="logic-value">{currentValue ? "1" : "0"}</span></div>
    {canVector && <div className="context-tabs">
      <button className={activeMode === "vector" ? "active" : ""} onClick={() => onMode("vector")}>Vector</button>
      <button className={activeMode === "granular" ? "active" : ""} onClick={() => onMode("granular")}>Granular</button>
    </div>}
    <div className="context-label">{t("mapping.choosePort")}</div>
    <div className="context-search"><Search size={14} /><input autoFocus value={search} onChange={(event) => onSearch(event.target.value)} placeholder={t("mapping.search")} /></div>
    <div className="context-options">
      {activeMode === "vector" && activeGroup
        ? <VectorOptions group={activeGroup} ports={ports} search={search} onAssign={onAssign} assignments={assignments} />
        : activeEndpoint
          ? <GranularOptions endpoint={activeEndpoint} ports={ports} search={search} onAssign={onAssign} assignments={assignments} />
          : <p>{t("mapping.noTarget")}</p>}
    </div>
    {hasAssignment && <button className="clear-assignment" onClick={() => onClear(activeMode === "vector" ? activeGroup!.id : activeEndpoint!.id)}><Trash2 size={13} />{t("mapping.clear")}</button>}
  </div>;
}

function VectorOptions({ group, ports, search, assignments, onAssign }: {
  group: BoardGroup;
  ports: EntityPort[];
  search: string;
  assignments: Assignment[];
  onAssign: (assignment: Assignment) => void;
}) {
  const { t } = useI18n();
  const options = compatibleVectorPorts(group, ports, search);
  if (!options.length) return <p>{t("mapping.noVectors", { direction: group.direction })}</p>;
  return <>{options.map((port) => {
    const current = assignments.some((assignment) => assignment.kind === "vector" && assignment.endpointId === group.id && assignment.portId === port.name);
    return <button key={optionKey(port.name)} onClick={() => onAssign({ id: `vector:${group.id}:${port.name}`, kind: "vector", endpointId: group.id, portId: port.name })}>
      <span className={`port-dot ${port.direction}`} /> <b>{port.name}</b><small>{port.type}</small>{current && <em>{t("common.current")}</em>}
    </button>;
  })}</>;
}

function GranularOptions({ endpoint, ports, search, assignments, onAssign }: {
  endpoint: BoardEndpoint;
  ports: EntityPort[];
  search: string;
  assignments: Assignment[];
  onAssign: (assignment: Assignment) => void;
}) {
  const { t } = useI18n();
  const options = compatibleGranularPorts(endpoint, ports, search);
  if (!options.length) return <p>{t("mapping.noPorts", { direction: endpoint.direction })}</p>;
  return <>{options.map((port) => {
    const current = assignments.some((assignment) => assignment.kind === "granular" && assignment.endpointId === endpoint.id && assignment.portId === port.id);
    return <button key={port.id} onClick={() => onAssign({ id: `granular:${endpoint.id}:${port.id}`, kind: "granular", endpointId: endpoint.id, portId: port.id })}>
      <span className={`port-dot ${port.direction}`} /> <b>{port.id}</b><small>{port.type}</small>{current && <em>{t("common.current")}</em>}
    </button>;
  })}</>;
}
