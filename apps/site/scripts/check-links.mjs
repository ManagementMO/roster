import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../dist/", import.meta.url));
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => entry.isDirectory() ? files(path.join(dir, entry.name)) : [path.join(dir, entry.name)]);
}
const htmlFiles = files(root).filter((file) => file.endsWith(".html"));
const documents = new Map(htmlFiles.map((file) => [file, fs.readFileSync(file, "utf8")]));
const errors = [];
let checked = 0;
const resolveFile = (pathname) => {
  const direct = path.join(root, decodeURIComponent(pathname));
  return [direct, path.join(direct, "index.html"), `${direct}.html`].find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile());
};
for (const [file, html] of documents) {
  const route = `/${path.relative(root, file).replaceAll(path.sep, "/").replace(/index\.html$/, "")}`;
  const ids = new Set([...html.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
  for (const tag of html.matchAll(/<(?:a|link|img|script|source)\b[^>]*>/g)) {
    for (const attribute of tag[0].matchAll(/(?:href|src)=["']([^"']+)["']/g)) {
      const href = attribute[1].replaceAll("&amp;", "&");
      const target = new URL(href, `https://site.invalid${route}`);
      if (target.origin !== "https://site.invalid") continue;
      checked++;
      const found = resolveFile(target.pathname);
      if (!found) { errors.push(`${route}: missing ${href}`); continue; }
      if (target.hash && found.endsWith(".html")) {
        const targetIds = found === file ? ids : new Set([...(documents.get(found) ?? "").matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]));
        if (!targetIds.has(decodeURIComponent(target.hash.slice(1)))) errors.push(`${route}: missing anchor ${href}`);
      }
    }
  }
}
for (const file of files(root).filter((file) => file.endsWith(".css"))) {
  const css = fs.readFileSync(file, "utf8");
  for (const match of css.matchAll(/url\(["']?(\/[^)"']+)["']?\)/g)) {
    checked++;
    if (!resolveFile(match[1])) errors.push(`${path.relative(root, file)}: missing ${match[1]}`);
  }
}
try {
  const metadata = JSON.parse(fs.readFileSync(path.join(root, "pagefind/pagefind-entry.json"), "utf8"));
  const languages = Object.values(metadata.languages ?? {});
  const expected = [...documents.values()].filter((html) => html.includes("data-pagefind-body")).length;
  const indexed = languages.reduce((sum, language) => sum + language.page_count, 0);
  if (expected === 0 || indexed !== expected) errors.push(`Pagefind indexed ${indexed} pages; expected ${expected}.`);
  for (const language of languages) {
    if (!resolveFile(`/pagefind/pagefind.${language.hash}.pf_meta`) || !resolveFile(`/pagefind/wasm.${language.wasm}.pagefind`)) errors.push("Pagefind metadata references a missing search asset.");
  }
} catch {
  errors.push("Pagefind metadata is missing, empty, or invalid. Run the complete production build.");
}
if (errors.length) {
  console.error(errors.join("\n"));
  process.exitCode = 1;
} else {
  console.log(`${htmlFiles.length} pages; ${checked} internal links, anchors, and assets checked.`);
}
