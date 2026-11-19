#!/usr/bin/env -S node --experimental-strip-types
/** Sort `## Related pages` bullet blocks alphabetically in every wiki page. */
import { glob, readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const wiki = resolve(root, "wiki");

const HEADER_RE = /^## Related pages\s*$/;
const BULLET_RE = /^\s*-\s+/;

function sortBlock(lines: string[]): [string[], boolean] {
  const out: string[] = [];
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    if (HEADER_RE.test(lines[i])) {
      out.push(lines[i++]);
      while (i < lines.length && lines[i].trim() === "") out.push(lines[i++]);
      const bullets: string[] = [];
      while (i < lines.length && BULLET_RE.test(lines[i])) bullets.push(lines[i++]);
      if (bullets.length) {
        const sorted = [...bullets].sort((a, b) =>
          a.replace(/^\s*-\s*\[/, "").toLowerCase().localeCompare(
            b.replace(/^\s*-\s*\[/, "").toLowerCase()
          )
        );
        if (sorted.join("\n") !== bullets.join("\n")) changed = true;
        out.push(...sorted);
      }
      continue;
    }
    out.push(lines[i++]);
  }

  return [out, changed];
}

let total = 0;
const pages: string[] = [];
for await (const p of glob("wiki/**/*.md", { cwd: root })) pages.push(p);

for (const rel of pages.sort()) {
  const p = resolve(root, rel);
  const lines = (await readFile(p, "utf8")).split("\n");
  const [newLines, didChange] = sortBlock(lines);
  if (didChange) {
    await writeFile(p, newLines.join("\n"));
    console.log(`sorted: ${relative(wiki, p)}`);
    total++;
  }
}

console.log(`${total} files updated`);
