import { loader } from "@monaco-editor/react";
import * as monaco from "monaco-editor/editor/editor.api";
import EditorWorker from "monaco-editor/editor/editor.worker.js?worker";
import { vhdlKeywords, vhdlLanguageDefinition, vhdlSnippets, vhdlTypes } from "./vhdlLanguage";

self.MonacoEnvironment = {
  getWorker: () => new EditorWorker()
};

loader.config({ monaco });

let configured = false;

export function configureMonaco(instance: typeof monaco) {
  if (configured) return;
  configured = true;
  instance.languages.register({ id: "vhdl", extensions: [".vhd", ".vhdl"], aliases: ["VHDL"] });
  instance.languages.setMonarchTokensProvider("vhdl", vhdlLanguageDefinition);
  instance.languages.setLanguageConfiguration("vhdl", {
    comments: { lineComment: "--" },
    brackets: [["(", ")"], ["[", "]"]],
    autoClosingPairs: [{ open: "(", close: ")" }, { open: "[", close: "]" }, { open: "\"", close: "\"" }, { open: "'", close: "'" }]
  });
  instance.languages.registerCompletionItemProvider("vhdl", {
    provideCompletionItems(model, position) {
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn
      };
      return {
        suggestions: [
          ...vhdlSnippets.map((snippet) => ({
            label: snippet.label,
            detail: snippet.detail,
            kind: instance.languages.CompletionItemKind.Snippet,
            insertText: snippet.insertText,
            insertTextRules: instance.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            sortText: `0-${snippet.label}`,
            range
          })),
          ...vhdlKeywords.map((keyword) => ({
            label: keyword,
            kind: instance.languages.CompletionItemKind.Keyword,
            insertText: keyword,
            sortText: `1-${keyword}`,
            range
          })),
          ...vhdlTypes.map((type) => ({
            label: type,
            kind: instance.languages.CompletionItemKind.TypeParameter,
            insertText: type,
            sortText: `2-${type}`,
            range
          }))
        ]
      };
    }
  });
  instance.editor.defineTheme("logicboard-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "60757D", fontStyle: "italic" },
      { token: "keyword", foreground: "4FD5DD" },
      { token: "type", foreground: "9AD7A8" },
      { token: "number", foreground: "D6A757" },
      { token: "string", foreground: "D69A76" },
      { token: "attribute.name", foreground: "C792EA" },
      { token: "operator", foreground: "9FB2BC" }
    ],
    colors: {
      "editor.background": "#0c1013",
      "editor.foreground": "#cbd3d8",
      "editorLineNumber.foreground": "#3f4c55",
      "editorLineNumber.activeForeground": "#78909b",
      "editorCursor.foreground": "#39d0d8",
      "editor.selectionBackground": "#24545d88",
      "editor.inactiveSelectionBackground": "#203d4466",
      "editorGutter.background": "#0c1013"
    }
  });
}
