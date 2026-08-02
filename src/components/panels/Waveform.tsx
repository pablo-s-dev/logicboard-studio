import { useEffect, useMemo, useState } from "react";
import { Activity, Eye, EyeOff } from "lucide-react";
import type { ExpandedAssignment, WaveSample } from "../../types";

const lowColor = "#4bf0a5";
const highColor = "#ff5c4f";

const uniqueRows = (assignments: ExpandedAssignment[]) => assignments.filter((assignment, index, array) =>
  array.findIndex((item) => item.endpointId === assignment.endpointId) === index
);

export function Waveform({ samples, assignments }: { samples: WaveSample[]; assignments: ExpandedAssignment[] }) {
  const [hiddenSignals, setHiddenSignals] = useState<string[]>([]);
  const rows = useMemo(() => uniqueRows(assignments), [assignments]);
  const hiddenSet = useMemo(() => new Set(hiddenSignals), [hiddenSignals]);
  const visibleRows = rows.filter((assignment) => !hiddenSet.has(assignment.endpointId));
  const hiddenCount = rows.length - visibleRows.length;
  const sample = samples.at(-1);

  useEffect(() => {
    setHiddenSignals((old) => {
      const current = new Set(rows.map((row) => row.endpointId));
      const next = old.filter((endpointId) => current.has(endpointId));
      return next.length === old.length ? old : next;
    });
  }, [rows]);

  if (!sample) {
    return <div className="empty-wave">
      <Activity size={22} />
      <div><b>Sample capture is ready</b><span>Run the simulation to capture the current mapped signal values.</span></div>
    </div>;
  }

  return <div className="sample-panel">
    <div className="sample-toolbar">
      <div>
        <b>Current sample</b>
        <span>{sample.time} ns</span>
      </div>
      <div className="sample-legend">
        <span><i style={{ background: lowColor }} />0 low</span>
        <span><i style={{ background: highColor }} />1 high</span>
      </div>
      {hiddenCount > 0 && <button type="button" onClick={() => setHiddenSignals([])}><Eye size={13} />Show all</button>}
    </div>
    <div className="sample-table">
      {visibleRows.map((assignment) => {
        const value = !!sample.values[assignment.endpointId];
        return <div className="sample-row" key={assignment.endpointId}>
          <button type="button" title={`Hide ${assignment.portId}`} onClick={() => setHiddenSignals((old) => old.includes(assignment.endpointId) ? old : [...old, assignment.endpointId])}><EyeOff size={12} /></button>
          <span><b>{assignment.portId}</b><em>{assignment.endpointLabel}</em></span>
          <strong style={{ color: value ? highColor : lowColor }}>{value ? "1" : "0"}</strong>
        </div>;
      })}
      {!visibleRows.length && <div className="sample-empty">All mapped signals are hidden.</div>}
    </div>
  </div>;
}
