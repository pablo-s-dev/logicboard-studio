export type Point = { x: number; y: number };
export type Size = { width: number; height: number };

export function placeTooltip(pointer: Point, tooltip: Size, viewport: Size, margin = 8, gap = 12): Point {
  const availableWidth = Math.max(0, viewport.width - margin * 2);
  const availableHeight = Math.max(0, viewport.height - margin * 2);
  const width = Math.min(tooltip.width, availableWidth);
  const height = Math.min(tooltip.height, availableHeight);
  let x = pointer.x + gap;
  let y = pointer.y + gap;

  if (x + width > viewport.width - margin) x = pointer.x - width - gap;
  if (y + height > viewport.height - margin) y = pointer.y - height - gap;

  return {
    x: Math.min(Math.max(margin, x), Math.max(margin, viewport.width - width - margin)),
    y: Math.min(Math.max(margin, y), Math.max(margin, viewport.height - height - margin))
  };
}
