import { Info } from "lucide-react";

export function LogPanel({ lines, empty, problem = false }: { lines: string[]; empty: string; problem?: boolean }) {
  return <div className={`log-panel ${problem ? "problem-log" : ""}`}>
    {lines.length ? lines.map((line, index) => <div key={`${index}-${line}`}><Info size={14} />{line || "\u00a0"}</div>) : <p>{empty}</p>}
  </div>;
}
