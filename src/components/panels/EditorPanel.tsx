import { useLayoutEffect, useRef } from "react";
import { FileCode2 } from "lucide-react";

type EditorPanelProps = {
  activeFileName: string;
  activeContent: string;
  readOnly: boolean;
  onChange: (value: string) => void;
};

export function EditorPanel({ activeFileName, activeContent, readOnly, onChange }: EditorPanelProps) {
  const lineNumbersRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const syncLineNumbers = (scrollTop: number) => {
    if (lineNumbersRef.current) lineNumbersRef.current.style.transform = `translateY(${-scrollTop}px)`;
  };

  useLayoutEffect(() => {
    syncLineNumbers(textareaRef.current?.scrollTop ?? 0);
  }, [activeContent, activeFileName]);

  return <section className="editor-panel">
    <div className="editor-tabs">
      <div className="editor-tab active">
        <FileCode2 size={14} />
        <span className="editor-tab-name">{activeFileName}</span>
        {readOnly ? <em>read-only</em> : <i>modified</i>}
      </div>
    </div>
    <div className={`editor-wrap ${readOnly ? "read-only" : ""}`}>
      <div className="line-numbers" aria-hidden="true">
        <div className="line-numbers-inner" ref={lineNumbersRef}>
          {activeContent.split("\n").map((_, index) => <span key={index}>{index + 1}</span>)}
        </div>
      </div>
      <textarea
        ref={textareaRef}
        spellCheck={false}
        value={activeContent}
        readOnly={readOnly}
        onChange={(event) => !readOnly && onChange(event.target.value)}
        onScroll={(event) => syncLineNumbers(event.currentTarget.scrollTop)}
        aria-label={readOnly ? "Generated constraints view" : "VHDL source editor"}
      />
    </div>
  </section>;
}
