export type Direction = "in" | "out";
export type DeviceKind = "switch" | "button" | "led-red" | "led-green" | "seven-segment" | "clock";

export interface BoardEndpoint {
  id: string;
  label: string;
  pin: string;
  direction: Direction;
  kind: DeviceKind;
  activeLow?: boolean;
  group: string;
  displayOrder?: number;
  displayLabel?: string;
}

export interface BoardDefinition {
  id: string;
  name: string;
  device: string;
  endpoints: BoardEndpoint[];
}

export interface EntityPort {
  id: string;
  name: string;
  direction: Direction;
  type: string;
  bit?: number;
}

export interface Assignment { endpointId: string; portId: string }
export interface WaveSample { time: number; values: Record<string, boolean> }
