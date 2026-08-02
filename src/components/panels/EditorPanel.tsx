import { useLayoutEffect, useRef } from "react";
import { FileCode2 } from "lucide-react";
import { useI18n } from "../../i18n";

type EditorPanelProps = {
  tabs: EditorTab[];
  activePath: string;
  activeFileName: string;
  activeContent: string;
  readOnly: boolean;
  onSelect: (path: string) => void;
  onChange: (value: string) => void;
};

export type EditorTab = {
  path: string;
  name: string;
  modified?: boolean;
  readOnly?: boolean;
};

export function EditorPanel({ tabs, activePath, activeFileName, activeContent, readOnly, onSelect, onChange }: EditorPanelProps) {
  const { t } = useI18n();
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
      {tabs.map((tab) => <button
        type="button"
        key={tab.path}
        className={`editor-tab ${activePath === tab.path ? "active" : ""}`}
        title={tab.path}
        onClick={() => onSelect(tab.path)}
      >
        <FileCode2 size={14} />
        <span className="editor-tab-name">{tab.name}</span>
        {tab.readOnly ? <em>{t("common.readOnly")}</em> : tab.modified ? <i>{t("common.modified")}</i> : null}
      </button>)}
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
        aria-label={readOnly ? t("editor.generatedView") : t("editor.source")}
      />
    </div>
  </section>;
}
