/**
 * Minimal JSONC -> JSON: strips // line and /* *​/ block comments (string-aware)
 * and trailing commas. VS Code and Zed configs legitimately contain both.
 */
export function parseJsonc(input: string): unknown {
  // Strip a leading UTF-8 BOM: editors write it, and JSON.parse chokes on it —
  // one BOM'd client config otherwise aborted a whole sync fleet run (audit D2).
  const cleaned = input.charCodeAt(0) === 0xfeff ? input.slice(1) : input;
  return JSON.parse(stripTrailingCommas(stripComments(cleaned)));
}

function stripComments(input: string): string {
  let out = "";
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    const next = input[i + 1];
    if (inLine) {
      if (ch === "\n") {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === "*" && next === "/") {
        inBlock = false;
        i++;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === "\\") {
        if (next !== undefined) {
          out += next;
          i++;
        }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === "/" && next === "/") {
      inLine = true;
      i++;
      continue;
    }
    if (ch === "/" && next === "*") {
      inBlock = true;
      i++;
      continue;
    }
    out += ch;
  }
  return out;
}

function stripTrailingCommas(input: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i]!;
    if (inString) {
      out += ch;
      if (ch === "\\") {
        const next = input[i + 1];
        if (next !== undefined) {
          out += next;
          i++;
        }
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === ",") {
      let j = i + 1;
      while (j < input.length && /\s/.test(input[j]!)) j++;
      if (input[j] === "}" || input[j] === "]") continue; // drop trailing comma
    }
    out += ch;
  }
  return out;
}
