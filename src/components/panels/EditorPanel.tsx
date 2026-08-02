import { FileCode2 } from "lucide-react";

type EditorPanelProps = {
  activeFileName: string;
  activeContent: string;
  readOnly: boolean;
  onChange: (value: string) => void;
};

export function EditorPanel({ activeFileName, activeContent, readOnly, onChange }: EditorPanelProps) {
  return <section className="editor-panel">
    <div className="editor-tabs">
      <div className="editor-tab active">
        <FileCode2 size={14} />
        <span className="editor-tab-name">{activeFileName}</span>
        {readOnly ? <em>read-only</em> : <i>modified</i>}
      </div>
    </div>
    <div className={`editor-wrap ${readOnly ? "read-only" : ""}`}>
      <div className="line-numbers">{activeContent.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}</div>
      <textarea
        spellCheck={false}
        value={activeContent}
        readOnly={readOnly}
        onChange={(event) => !readOnly && onChange(event.target.value)}
        aria-label={readOnly ? "Generated constraints view" : "VHDL source editor"}
      />
    </div>
  </section>;
}
