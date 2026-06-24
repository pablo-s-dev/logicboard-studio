import { describe, expect, it } from "vitest";
import { parseEntityName, parseEntityPorts, previewOutputs } from "./vhdl";

const source = `entity top is port (SW : in std_logic_vector(1 downto 0); LED : out std_logic_vector(1 downto 0)); end; architecture rtl of top is begin LED <= SW; end;`;
describe("VHDL project model", () => {
  it("finds the top entity name", () => expect(parseEntityName(source)).toBe("top"));
  it("expands vector entity ports", () => expect(parseEntityPorts(source).map((p) => p.id)).toEqual(["SW[1]", "SW[0]", "LED[1]", "LED[0]"]));
  it("previews direct concurrent assignments", () => {
    const ports = parseEntityPorts(source);
    expect(previewOutputs(source, { "SW[0]": true, "SW[1]": false }, ports)["LED[0]"]).toBe(true);
  });
  it("settles chained assignments regardless of source order", () => {
    const chained = `entity top is port (SW : in std_logic; LED : out std_logic); end;
      architecture rtl of top is signal middle : std_logic; begin LED <= middle; middle <= SW; end;`;
    const ports = parseEntityPorts(chained);
    expect(previewOutputs(chained, { SW: true }, ports).LED).toBe(true);
  });
  it("previews logic literals", () => {
    const literal = `entity top is port (LED : out std_logic); end; architecture rtl of top is begin LED <= '1'; end;`;
    const ports = parseEntityPorts(literal);
    expect(previewOutputs(literal, {}, ports).LED).toBe(true);
  });
});
