export type ProjectPopoverAlignment = "left" | "right";

export function projectPopoverPosition({
  anchorLeft,
  anchorRight,
  anchorBottom,
  viewportWidth,
  viewportHeight,
  preferredWidth,
  alignment,
  gap = 4,
  viewportMargin = 8
}: {
  anchorLeft: number;
  anchorRight: number;
  anchorBottom: number;
  viewportWidth: number;
  viewportHeight: number;
  preferredWidth: number;
  alignment: ProjectPopoverAlignment;
  gap?: number;
  viewportMargin?: number;
}) {
  const width = Math.min(preferredWidth, Math.max(0, viewportWidth - viewportMargin * 2));
  const idealLeft = alignment === "right" ? anchorRight - width : anchorLeft;
  const maximumLeft = Math.max(viewportMargin, viewportWidth - width - viewportMargin);
  const left = Math.min(Math.max(viewportMargin, idealLeft), maximumLeft);
  const top = Math.min(anchorBottom + gap, Math.max(viewportMargin, viewportHeight - viewportMargin));

  return {
    left,
    top,
    width,
    maxHeight: Math.max(0, viewportHeight - top - viewportMargin)
  };
}
