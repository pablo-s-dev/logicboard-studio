import Editor from "@monaco-editor/react";
import { FileCode2, X } from "lucide-react";
import { useI18n } from "../../i18n";
import { configureMonaco } from "../../editor/monaco";

type EditorPanelProps = {
  tabs: EditorTab[];
  activePath: string;
  activeContent: string;
  readOnly: boolean;
  onSelect: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (value: string) => void;
};

export type EditorTab = {
  path: string;
  name: string;
  modified?: boolean;
  readOnly?: boolean;
};

export function EditorPanel({ tabs, activePath, activeContent, readOnly, onSelect, onClose, onChange }: EditorPanelProps) {
  const { t } = useI18n();

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
        <span
          className="editor-tab-close"
          role="button"
          tabIndex={0}
          aria-label={t("editor.closeTab", { name: tab.name })}
          onClick={(event) => { event.stopPropagation(); onClose(tab.path); }}
          onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); event.stopPropagation(); onClose(tab.path); } }}
        ><X size={13} /></span>
      </button>)}
    </div>
    {activePath ? <div className={`editor-wrap monaco-wrap ${readOnly ? "read-only" : ""}`}>
      <Editor
        path={`logicboard://project/${activePath}`}
        language={readOnly ? "plaintext" : "vhdl"}
        value={activeContent}
        theme="logicboard-dark"
        beforeMount={configureMonaco}
        onMount={(editor, monaco) => {
          editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyP, () => {
            void editor.getAction("editor.action.quickCommand")?.run();
          });
        }}
        onChange={(value) => !readOnly && onChange(value ?? "")}
        options={{
          automaticLayout: true,
          readOnly,
          minimap: { enabled: false },
          fontFamily: "IBM Plex Mono, Consolas, monospace",
          fontSize: 11,
          lineHeight: 20,
          lineNumbersMinChars: 3,
          padding: { top: 10, bottom: 20 },
          scrollBeyondLastLine: false,
          tabSize: 2,
          wordWrap: "off",
          renderLineHighlight: "line",
          overviewRulerBorder: false,
          fixedOverflowWidgets: true,
          quickSuggestions: { other: true, comments: false, strings: false },
          snippetSuggestions: "top",
          suggestOnTriggerCharacters: true,
          ariaLabel: readOnly ? t("editor.generatedView") : t("editor.source")
        }}
      />
    </div> : <div className="editor-empty"><FileCode2 size={24} /><span>{t("editor.empty")}</span></div>}
  </section>;
}
