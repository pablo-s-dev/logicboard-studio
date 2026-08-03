import type * as Monaco from "monaco-editor/editor/editor.api";

export const vhdlKeywords = [
  "abs", "access", "after", "alias", "all", "and", "architecture", "array", "assert", "attribute",
  "begin", "block", "body", "buffer", "bus", "case", "component", "configuration", "constant",
  "disconnect", "downto", "else", "elsif", "end", "entity", "exit", "file", "for", "function",
  "generate", "generic", "group", "guarded", "if", "impure", "in", "inertial", "inout", "is",
  "label", "library", "linkage", "literal", "loop", "map", "mod", "nand", "new", "next", "nor",
  "not", "null", "of", "on", "open", "or", "others", "out", "package", "port", "postponed",
  "procedure", "process", "pure", "range", "record", "register", "reject", "rem", "report", "return",
  "rol", "ror", "select", "severity", "signal", "shared", "sla", "sll", "sra", "srl", "subtype",
  "then", "to", "transport", "type", "unaffected", "units", "until", "use", "variable", "wait", "when",
  "while", "with", "xnor", "xor"
];

export const vhdlTypes = [
  "bit", "bit_vector", "boolean", "character", "integer", "natural", "positive", "real", "signed",
  "std_logic", "std_logic_vector", "string", "time", "unsigned"
];

export const vhdlLanguageDefinition = {
  defaultToken: "",
  ignoreCase: true,
  keywords: vhdlKeywords,
  typeKeywords: vhdlTypes,
  tokenizer: {
    root: [
      [/--.*$/, "comment"],
      [/[a-zA-Z_]\w*/, { cases: { "@keywords": "keyword", "@typeKeywords": "type", "@default": "identifier" } }],
      [/\d+(?:_\d+)*(?:\.\d+(?:_\d+)*)?(?:e[+-]?\d+)?/i, "number"],
      [/"(?:[^"]|"")*"/, "string"],
      [/'(?:[^']|'')'/, "string"],
      [/'[a-zA-Z_]\w*/, "attribute.name"],
      [/[<>]=?|:=|=>|\*\*|[+\-*\/=\&]/, "operator"],
      [/[()[\],.;:]/, "delimiter"]
    ]
  }
} satisfies Monaco.languages.IMonarchLanguage;
