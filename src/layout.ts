export const minimumBottomPaneHeight = 96;
export const minimumUpperWorkspaceHeight = 220;

export const bottomPaneLimits = (workspaceHeight: number): [number, number] => [
  minimumBottomPaneHeight,
  Math.max(minimumBottomPaneHeight, workspaceHeight - minimumUpperWorkspaceHeight - 5)
];
