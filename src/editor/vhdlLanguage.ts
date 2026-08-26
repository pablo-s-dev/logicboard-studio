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

export const vhdlSnippets = [
  {
    label: "library ieee",
    detail: "IEEE standard logic imports",
    insertText: "library ieee;\nuse ieee.std_logic_1164.all;"
  },
  {
    label: "entity",
    detail: "Entity declaration",
    insertText: "entity ${1:entity_name} is\n  port (\n    ${2:signal_name} : ${3:in} ${4:std_logic}\n  );\nend entity ${1:entity_name};"
  },
  {
    label: "architecture",
    detail: "Architecture body",
    insertText: "architecture ${1:rtl} of ${2:entity_name} is\nbegin\n  ${0}\nend architecture ${1:rtl};"
  },
  {
    label: "process",
    detail: "Combinational process",
    insertText: "process(${1:signal_name})\nbegin\n  ${0}\nend process;"
  },
  {
    label: "clocked process",
    detail: "Rising-edge clocked process",
    insertText: "process(${1:clock})\nbegin\n  if rising_edge(${1:clock}) then\n    ${0}\n  end if;\nend process;"
  },
  {
    label: "case",
    detail: "Case statement",
    insertText: "case ${1:expression} is\n  when ${2:choice} =>\n    ${0}\n  when others =>\n    null;\nend case;"
  }
] as const;

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
