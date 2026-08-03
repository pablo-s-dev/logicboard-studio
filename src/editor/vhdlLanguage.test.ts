import { describe, expect, it } from "vitest";
import { vhdlKeywords, vhdlLanguageDefinition, vhdlTypes } from "./vhdlLanguage";

describe("VHDL Monaco language", () => {
  it("registers core declarations and standard logic types", () => {
    expect(vhdlKeywords).toEqual(expect.arrayContaining(["entity", "architecture", "process", "signal", "port"]));
    expect(vhdlTypes).toEqual(expect.arrayContaining(["std_logic", "std_logic_vector", "integer"]));
  });

  it("contains tokenizer rules for comments, numbers and strings", () => {
    const rules = vhdlLanguageDefinition.tokenizer.root as Array<[RegExp, unknown]>;
    expect(rules.some(([pattern, token]) => token === "comment" && pattern.test("-- comment"))).toBe(true);
    expect(rules.some(([pattern, token]) => token === "number" && pattern.test("50_000_000"))).toBe(true);
    expect(rules.some(([pattern, token]) => token === "string" && pattern.test("\"hello\""))).toBe(true);
  });
});
