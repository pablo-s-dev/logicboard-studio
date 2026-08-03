import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from "lucide-react";

export type CollapseDirection = "left" | "right" | "up" | "down";

const icons = {
  left: ChevronLeft,
  right: ChevronRight,
  up: ChevronUp,
  down: ChevronDown
};

export function CollapseButton({ direction, title, onClick, className = "" }: {
  direction: CollapseDirection;
  title: string;
  onClick: () => void;
  className?: string;
}) {
  const Icon = icons[direction];
  return <button
    type="button"
    className={`collapse-button ${className}`.trim()}
    title={title}
    aria-label={title}
    onClick={onClick}
  ><Icon size={15} strokeWidth={1.8} /></button>;
}
