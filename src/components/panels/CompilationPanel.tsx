import { AlertTriangle, CheckCircle2, CircleX, Clock3, Cpu, FileCode2, LoaderCircle } from "lucide-react";
import { useI18n } from "../../i18n";

export type CompilationStatus = "running" | "success" | "blocked" | "failed";

export interface CompilationReport {
  status: CompilationStatus;
  engine: string;
  engineVersion?: string;
  standard: string;
  projectName: string;
  board: string;
  topEntity: string;
  sources: Array<{ path: string; lines: number }>;
  inputPorts: number;
  outputPorts: number;
  assignments: number;
  clocks: string[];
  durationMs?: number;
  preview: boolean;
}

const statusIcon = {
  running: <LoaderCircle className="spin" size={16} />,
  success: <CheckCircle2 size={16} />,
  blocked: <AlertTriangle size={16} />,
  failed: <CircleX size={16} />
};

export function CompilationPanel({ report, lines, empty }: {
  report: CompilationReport | null;
  lines: string[];
  empty: string;
}) {
  const { t } = useI18n();
  if (!report) return <div className="compilation-empty"><Cpu size={22} /><span>{empty}</span></div>;

  const mode = report.clocks.length
    ? t("compile.report.clocked", { clocks: report.clocks.join(", ") })
    : t("compile.report.combinational");
  const duration = report.durationMs === undefined
    ? t("compile.report.pending")
    : t("compile.report.duration", { duration: Math.max(0, Math.round(report.durationMs)) });
  const statusLabel = report.preview && report.status === "success"
    ? t("compile.report.status.preview")
    : t(`compile.report.status.${report.status}`);

  return <div className="compilation-report">
    <header className={`compilation-status ${report.status}`}>
      {statusIcon[report.status]}
      <span>
        <b>{statusLabel}</b>
        <small>{report.preview ? t("compile.report.previewScope") : t("compile.report.desktopScope")}</small>
      </span>
      <time><Clock3 size={12} />{duration}</time>
    </header>

    <div className="compilation-summary">
      <div><small>{t("compile.report.engine")}</small><b>{report.engineVersion || report.engine}</b><span>{report.standard}</span></div>
      <div><small>{t("compile.report.target")}</small><b>{report.topEntity}</b><span>{report.projectName} · {report.board}</span></div>
      <div><small>{t("compile.report.interface")}</small><b>{t("compile.report.ports", { inputs: report.inputPorts, outputs: report.outputPorts })}</b><span>{t("compile.report.assignments", { count: report.assignments })}</span></div>
      <div><small>{t("compile.report.simulation")}</small><b>{mode}</b><span>{report.clocks.length ? t("compile.report.timeShown") : t("compile.report.noTime")}</span></div>
    </div>

    <section className="compilation-sources">
      <h4><FileCode2 size={13} />{t("compile.report.sources", { count: report.sources.length })}</h4>
      <ol>{report.sources.map((source) => <li key={source.path}><code>{source.path}</code><span>{t("compile.report.lines", { count: source.lines })}</span></li>)}</ol>
    </section>

    {lines.length > 0 && <section className="compilation-output">
      <h4>{t("compile.report.output")}</h4>
      {lines.map((line, index) => <div key={`${index}-${line}`} className={/aviso|warning/i.test(line) ? "warning" : ""}>{line || "\u00a0"}</div>)}
    </section>}
  </div>;
}
