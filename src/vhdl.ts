import type { EntityPort } from "./types";

export function parseEntityName(source: string): string | null {
  return source.replace(/--.*$/gm, " ").match(/entity\s+(\w+)\s+is/i)?.[1] ?? null;
}

export function parseEntityPorts(source: string): EntityPort[] {
  const cleaned = source.replace(/--.*$/gm, " ");
  const entity = cleaned.match(/entity\s+\w+\s+is[\s\S]*?port\s*\(/i);
  if (!entity || entity.index === undefined) return [];
  const open = entity.index + entity[0].lastIndexOf("(");
  let depth = 0;
  let close = -1;
  for (let i = open; i < cleaned.length; i++) {
    if (cleaned[i] === "(") depth++;
    if (cleaned[i] === ")" && --depth === 0) { close = i; break; }
  }
  if (close < 0) return [];
  const portBlock = cleaned.slice(open + 1, close);
  const ports: EntityPort[] = [];
  for (const declaration of portBlock.split(";")) {
    const item = declaration.trim().match(/^([\w\s,]+):\s*(in|out)\s+(.+)$/i);
    if (!item) continue;
    const [, names, rawDirection, rawType] = item;
    const direction = rawDirection.toLowerCase() as "in" | "out";
    const range = rawType.match(/(?:std_logic_vector|unsigned|signed)\s*\(\s*(\d+)\s*(downto|to)\s*(\d+)\s*\)/i);
    for (const name of names.split(",").map((value) => value.trim()).filter(Boolean)) {
      if (!range) ports.push({ id: name, name, direction, type: rawType.trim() });
      else {
        const from = Number(range[1]); const to = Number(range[3]); const step = range[2].toLowerCase() === "downto" ? -1 : 1;
        for (let bit = from; step < 0 ? bit >= to : bit <= to; bit += step) ports.push({ id: `${name}[${bit}]`, name, bit, direction, type: rawType.trim() });
      }
    }
  }
  return ports;
}

export function previewOutputs(source: string, portValues: Record<string, boolean>, ports: EntityPort[]): Record<string, boolean> {
  const values = { ...portValues };
  const getVectorBits = (name: string) => ports.filter((p) => p.name.toLowerCase() === name.toLowerCase()).sort((a, b) => (a.bit ?? 0) - (b.bit ?? 0));
  const assignments = source.replace(/--.*$/gm, "").split(";").flatMap((statement) => {
    const direct = statement.match(/(\w+)(?:\((\d+)\))?\s*<=\s*(not\s+)?(?:([\w]+)(?:\((\d+)\))?|'([01])')\s*$/i);
    return direct ? [direct] : [];
  });

  const write = (id: string, next: boolean) => {
    const changed = values[id] !== next;
    values[id] = next;
    return changed;
  };

  // Concurrent signal assignments settle independently of their textual order.
  for (let pass = 0; pass <= assignments.length; pass++) {
    let changed = false;
    for (const assignment of assignments) {
      const [, lhs, lhsBit, negate, rhs, rhsBit, literal] = assignment;
      if (literal !== undefined) {
        const targetId = lhsBit === undefined ? lhs : `${lhs}[${lhsBit}]`;
        changed = write(targetId, negate ? literal !== "1" : literal === "1") || changed;
      } else if (lhsBit !== undefined || rhsBit !== undefined) {
        const sourceId = rhsBit === undefined ? rhs : `${rhs}[${rhsBit}]`;
        const targetId = lhsBit === undefined ? lhs : `${lhs}[${lhsBit}]`;
        changed = write(targetId, negate ? !values[sourceId] : !!values[sourceId]) || changed;
      } else {
        const left = getVectorBits(lhs); const right = getVectorBits(rhs);
        if (left.length && right.length) {
          left.forEach((port, i) => { changed = write(port.id, negate ? !values[right[i]?.id] : !!values[right[i]?.id]) || changed; });
        } else {
          changed = write(lhs, negate ? !values[rhs] : !!values[rhs]) || changed;
        }
      }
    }
    if (!changed) break;
  }
  return values;
}
