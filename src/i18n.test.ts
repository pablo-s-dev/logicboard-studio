import { describe, expect, it } from "vitest";
import { resolveLanguage, translate } from "./i18n";

describe("interface localization", () => {
  it("uses Brazilian Portuguese when no preference exists", () => {
    expect(resolveLanguage(null)).toBe("pt-BR");
    expect(resolveLanguage("invalid")).toBe("pt-BR");
    expect(translate("pt-BR", "toolbar.run")).toBe("Executar");
  });

  it("preserves an explicit English preference", () => {
    expect(resolveLanguage("en-US")).toBe("en-US");
    expect(translate("en-US", "toolbar.run")).toBe("Run");
  });

  it("interpolates translated values", () => {
    expect(translate("pt-BR", "board.assignedPins", { count: 12 })).toBe("12 pinos físicos atribuídos");
  });

  it("translates the project directory setting and credits activity", () => {
    expect(translate("pt-BR", "settings.projectDirectory")).toBe("Diretório padrão de projetos VHDL");
    expect(translate("pt-BR", "credits.title")).toBe("CRÉDITOS");
    expect(translate("en-US", "board.group.HEXES")).toBe("Seven-segment displays");
  });

  it("presents project persistence as a single save action", () => {
    expect(translate("pt-BR", "common.save")).toBe("Salvar");
    expect(translate("pt-BR", "project.save.help")).toBe("Salve as alterações no projeto atual");
    expect(translate("en-US", "project.save.help")).toBe("Save changes to the current project");
  });
});
