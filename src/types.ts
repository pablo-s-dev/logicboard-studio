export type Direction = "in" | "out";
export type DeviceKind = "switch" | "button" | "led-red" | "led-green" | "seven-segment" | "clock";
export type AssignmentKind = "granular" | "vector";
export type MappingMode = "granular" | "vector";

export interface BoardEndpoint {
  id: string;
  label: string;
  pin?: string;
  frequencyHz?: number;
  simulationFrequencyHz?: number;
  direction: Direction;
  kind: DeviceKind;
  activeLow?: boolean;
  group: string;
  groupId?: string;
  bit?: number;
  segment?: string;
  displayOrder?: number;
  displayLabel?: string;
}

export interface BoardGroup {
  id: string;
  label: string;
  direction: Direction;
  kind: DeviceKind;
  vectorName?: string;
  width?: number;
  activeLow?: boolean;
  displayOrder: number;
  children: BoardEndpoint[];
}

export interface BoardDefinition {
  id: string;
  name: string;
  device: string;
  groups: BoardGroup[];
  endpoints: BoardEndpoint[];
}

export interface EntityPort {
  id: string;
  name: string;
  direction: Direction;
  type: string;
  bit?: number;
}

export interface Assignment {
  id: string;
  kind: AssignmentKind;
  endpointId: string;
  portId: string;
}

export interface ExpandedAssignment {
  assignmentId: string;
  kind: AssignmentKind;
  endpointId: string;
  endpointLabel: string;
  pin?: string;
  portId: string;
  portName: string;
  direction: Direction;
}

export interface MappingTarget {
  mode: MappingMode;
  endpointId: string;
}

export interface WaveSample { time: number; values: Record<string, boolean> }
