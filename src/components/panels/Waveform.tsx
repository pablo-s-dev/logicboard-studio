import { useMemo } from "react";
import { Activity } from "lucide-react";
import type { ExpandedAssignment, WaveSample } from "../../types";
import { useI18n } from "../../i18n";

const lowColor = "#4bf0a5";
const highColor = "#ff5c4f";

const uniqueRows = (assignments: ExpandedAssignment[]) => assignments.filter((assignment, index, array) =>
  array.findIndex((item) => item.endpointId === assignment.endpointId) === index
);

export const countLogicalLevels = (rows: ExpandedAssignment[], sample: WaveSample) => ({
  low: rows.filter((row) => !sample.values[row.endpointId]).length,
  high: rows.filter((row) => !!sample.values[row.endpointId]).length
});

export function Waveform({ samples, assignments, timed }: { samples: WaveSample[]; assignments: ExpandedAssignment[]; timed: boolean }) {
  const { t } = useI18n();
  const rows = useMemo(() => uniqueRows(assignments), [assignments]);
  const sample = samples.at(-1);

  if (!sample) {
    return <div className="empty-wave">
      <Activity size={22} />
      <div><b>{t("wave.ready")}</b><span>{t("wave.ready.help")}</span></div>
    </div>;
  }

  const levels = countLogicalLevels(rows, sample);
  return <div className="sample-panel">
    <div className="sample-toolbar">
      <div>
        <b>{t("wave.current")}</b>
        <span>{timed ? `${sample.time} ns` : t("wave.combinational")}</span>
      </div>
      <div className="sample-legend">
        <span><i style={{ background: lowColor }} />{t("wave.lowCount", { count: levels.low })}</span>
        <span><i style={{ background: highColor }} />{t("wave.highCount", { count: levels.high })}</span>
      </div>
    </div>
    <div className="sample-table">
      {rows.map((assignment) => {
        const value = !!sample.values[assignment.endpointId];
        return <div className="sample-row" key={assignment.endpointId}>
          <span><b>{assignment.portId}</b><em>{assignment.endpointLabel}</em></span>
          <strong style={{ color: value ? highColor : lowColor }}>{value ? "1" : "0"}</strong>
        </div>;
      })}
    </div>
  </div>;
}
