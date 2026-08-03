export type ActivityView = "explorer" | "projects" | "credits" | null;

export function toggleActivityView(current: ActivityView, requested: Exclude<ActivityView, null>): ActivityView {
  return current === requested ? null : requested;
}
