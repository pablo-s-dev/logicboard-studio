import type { BoardEndpoint, ExpandedAssignment } from "./types";

export type SimulationClockConfig = {
  portId: string;
  halfPeriodPs: number;
  frequencyHz: number;
  simulationFrequencyHz: number;
  label: string;
};

export const nsPerMs = 1_000_000;
export const psPerSecond = 1_000_000_000_000;

export const clockHalfPeriodPs = (frequencyHz: number) =>
  Math.round(psPerSecond / frequencyHz / 2);

const formatNumber = (value: number) =>
  Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");

export const formatFrequency = (frequencyHz: number) => {
  if (frequencyHz >= 1_000_000) return `${formatNumber(frequencyHz / 1_000_000)} MHz`;
  if (frequencyHz >= 1_000) return `${formatNumber(frequencyHz / 1_000)} kHz`;
  return `${frequencyHz} Hz`;
};

export const buildSimulationClocks = (
  assignments: ExpandedAssignment[],
  endpoints: BoardEndpoint[]
): SimulationClockConfig[] => assignments.flatMap((assignment) => {
  const endpoint = endpoints.find((item) => item.id === assignment.endpointId);
  const simulationFrequencyHz = endpoint?.simulationFrequencyHz ?? endpoint?.frequencyHz;
  if (endpoint?.kind !== "clock" || !endpoint.frequencyHz || !simulationFrequencyHz) return [];
  return [{
    portId: assignment.portId,
    frequencyHz: endpoint.frequencyHz,
    simulationFrequencyHz,
    halfPeriodPs: clockHalfPeriodPs(simulationFrequencyHz),
    label: endpoint.label
  }];
});

export const simulatedTimeForWallClock = (
  wallNowMs: number,
  wallStartMs: number,
  simulationBaseNs: number,
  speed: number
) => Math.max(
  simulationBaseNs,
  Math.round(simulationBaseNs + Math.max(0, wallNowMs - wallStartMs) * speed * nsPerMs)
);

export const effectivePace = (simulatedDeltaNs: number, wallDeltaMs: number) => {
  if (wallDeltaMs <= 0) return 1;
  return simulatedDeltaNs / (wallDeltaMs * nsPerMs);
};
