import type { Assignment, BoardDefinition, BoardEndpoint, BoardGroup, Direction, EntityPort, ExpandedAssignment } from "../types";

export type PortVector = {
  name: string;
  direction: Direction;
  type: string;
  width: number;
  bits: EntityPort[];
};

const legacyId = (assignment: Partial<Assignment>, index: number) =>
  `${assignment.endpointId ?? "legacy"}:${assignment.portId ?? "unknown"}:${index}`;

export function normalizeAssignments(items: Partial<Assignment>[]): Assignment[] {
  return items.flatMap((item, index) => {
    if (!item.endpointId || !item.portId) return [];
    const vectorLike = !item.portId.includes("[") && item.endpointId === item.portId;
    return [{
      id: item.id ?? legacyId(item, index),
      kind: item.kind ?? (vectorLike ? "vector" : "granular"),
      endpointId: item.endpointId,
      portId: item.portId
    }];
  });
}

export function makeGranularAssignment(endpointId: string, portId: string): Assignment {
  return { id: `granular:${endpointId}:${portId}`, kind: "granular", endpointId, portId };
}

export function makeVectorAssignment(endpointId: string, portName: string): Assignment {
  return { id: `vector:${endpointId}:${portName}`, kind: "vector", endpointId, portId: portName };
}

export function applyAssignment(assignments: Assignment[], next: Assignment): Assignment[] {
  if (next.kind === "vector") {
    return [
      ...assignments.filter((assignment) => assignment.endpointId !== next.endpointId),
      next
    ];
  }
  return [
    ...assignments.filter((assignment) => assignment.endpointId !== next.endpointId && assignment.portId !== next.portId),
    next
  ];
}

export function portVectors(ports: EntityPort[]): PortVector[] {
  const groups = new Map<string, EntityPort[]>();
  for (const port of ports) {
    if (port.bit === undefined) continue;
    groups.set(port.name, [...(groups.get(port.name) ?? []), port]);
  }
  return Array.from(groups.entries()).flatMap(([name, bits]) => {
    const sorted = [...bits].sort((a, b) => (a.bit ?? 0) - (b.bit ?? 0));
    const first = sorted[0];
    if (!first) return [];
    return [{ name, direction: first.direction, type: first.type, width: sorted.length, bits: sorted }];
  });
}

export function findVectorPort(ports: EntityPort[], name: string): PortVector | undefined {
  return portVectors(ports).find((port) => port.name.toLowerCase() === name.toLowerCase());
}

export function findBoardGroup(board: BoardDefinition, id: string): BoardGroup | undefined {
  return board.groups.find((group) => group.id === id);
}

export function findEndpoint(board: BoardDefinition, id: string): BoardEndpoint | undefined {
  return board.endpoints.find((endpoint) => endpoint.id === id);
}

function portById(ports: EntityPort[]) {
  return new Map(ports.map((port) => [port.id, port]));
}

export function expandAssignments(assignments: Assignment[], board: BoardDefinition, ports: EntityPort[]): ExpandedAssignment[] {
  const portsById = portById(ports);
  const expanded: ExpandedAssignment[] = [];

  for (const assignment of assignments) {
    if (assignment.kind === "granular") {
      const endpoint = findEndpoint(board, assignment.endpointId);
      const port = portsById.get(assignment.portId);
      if (!endpoint || !port) continue;
      expanded.push({
        assignmentId: assignment.id,
        kind: assignment.kind,
        endpointId: endpoint.id,
        endpointLabel: endpoint.label,
        pin: endpoint.pin,
        portId: port.id,
        portName: port.name,
        direction: endpoint.direction
      });
      continue;
    }

    const group = findBoardGroup(board, assignment.endpointId);
    const vector = findVectorPort(ports, assignment.portId);
    if (!group || !vector) continue;

    for (const endpoint of group.children) {
      const bit = endpoint.bit;
      const port = vector.bits.find((item) => item.bit === bit);
      if (bit === undefined || !port) continue;
      expanded.push({
        assignmentId: assignment.id,
        kind: assignment.kind,
        endpointId: endpoint.id,
        endpointLabel: endpoint.label,
        pin: endpoint.pin,
        portId: port.id,
        portName: port.name,
        direction: endpoint.direction
      });
    }
  }

  return expanded;
}

export function compatibleGranularPorts(endpoint: BoardEndpoint, ports: EntityPort[], search: string) {
  const term = search.trim().toLowerCase();
  return ports.filter((port) =>
    port.direction === endpoint.direction &&
    (!term || `${port.id} ${port.type}`.toLowerCase().includes(term))
  );
}

export function compatibleVectorPorts(group: BoardGroup, ports: EntityPort[], search: string) {
  const term = search.trim().toLowerCase();
  return portVectors(ports).filter((port) =>
    port.direction === group.direction &&
    port.width === group.width &&
    (!term || `${port.name} ${port.type}`.toLowerCase().includes(term))
  );
}

export function mappedEndpointIds(expanded: ExpandedAssignment[]): Set<string> {
  return new Set(expanded.map((assignment) => assignment.endpointId));
}

export function assignmentStatus(group: BoardGroup, expanded: ExpandedAssignment[]) {
  const mapped = group.children.filter((endpoint) => expanded.some((assignment) => assignment.endpointId === endpoint.id)).length;
  if (mapped === 0) return "unmapped";
  if (mapped === group.children.length) return "mapped";
  return "partial";
}

export function generateQsf(assignments: Assignment[], board: BoardDefinition, ports: EntityPort[], topEntity: string | null): string {
  const expanded = expandAssignments(assignments, board, ports).sort((a, b) => a.endpointLabel.localeCompare(b.endpointLabel));
  const lines = [
    "# LogicBoard Studio generated Quartus assignments",
    `# Top entity: ${topEntity ?? "not found"}`,
    `# Target board: ${board.name} (${board.device})`,
    "",
    `set_global_assignment -name FAMILY "Cyclone II"`,
    `set_global_assignment -name DEVICE ${board.device}`,
    ...(topEntity ? [`set_global_assignment -name TOP_LEVEL_ENTITY ${topEntity}`] : []),
    ""
  ];

  for (const assignment of expanded) {
    if (!assignment.pin) {
      lines.push(`# Missing physical pin for ${assignment.endpointLabel}; cannot assign ${assignment.portId}`);
    } else {
      lines.push(`set_location_assignment PIN_${assignment.pin} -to ${assignment.portId}`);
    }
  }

  if (!expanded.length) lines.push("# No assignments yet.");
  return `${lines.join("\n")}\n`;
}

export function validateAssignments(assignments: Assignment[], board: BoardDefinition, ports: EntityPort[]) {
  const diagnostics: string[] = [];
  const expanded = expandAssignments(assignments, board, ports);
  const mappedPorts = new Set(expanded.map((assignment) => assignment.portId));

  for (const port of ports) {
    if (port.direction === "out" && !mappedPorts.has(port.id)) {
      diagnostics.push(`Output ${port.id} has no Quartus pin assignment.`);
    }
  }

  for (const assignment of assignments) {
    if (assignment.kind !== "vector") continue;
    const group = findBoardGroup(board, assignment.endpointId);
    const vector = findVectorPort(ports, assignment.portId);
    if (!vector) continue;
    if (!group) diagnostics.push(`Unknown board vector endpoint ${assignment.endpointId}.`);
    if (group && vector && group.width !== vector.width) {
      diagnostics.push(`Vector width mismatch: ${group.id} has ${group.width} pins but ${vector.name} has ${vector.width} bits.`);
    }
  }

  for (const group of board.groups) {
    if (group.kind === "clock") continue;
    const status = assignmentStatus(group, expanded);
    if (status === "partial") diagnostics.push(`${group.label} is partially mapped. Complete the vector or clear the remaining granular assignments.`);
  }

  for (const assignment of expanded) {
    if (!assignment.pin) diagnostics.push(`Board endpoint ${assignment.endpointLabel} is mapped to VHDL port ${assignment.portId}, but endpoint ${assignment.endpointLabel} has no physical FPGA pin in this board definition.`);
  }

  return Array.from(new Set(diagnostics));
}
