#!/usr/bin/env -S node --experimental-strip-types
/** Insert missing --- separators after **Last updated** lines in wiki pages. */
import { readFile, writeFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listWikiPages, WIKI_DIR } from "./wiki-pages.mts";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const wiki = resolve(root, WIKI_DIR);
let fixed = 0;

const pages = await listWikiPages(root);

for (const rel of pages.sort()) {
  const p = resolve(root, rel);
  const lines = (await readFile(p, "utf8")).split("\n");
  const out: string[] = [];
  let changed = false;
  let i = 0;

  while (i < lines.length) {
    out.push(lines[i]);
    if (lines[i].startsWith("**Last updated**")) {
      let j = i + 1;
      const blanks: string[] = [];
      while (j < lines.length && lines[j].trim() === "") blanks.push(lines[j++]);
      const hasSep = blanks.some((l) => l.trim() === "---");
      const nextIsHeading = j < lines.length && lines[j].startsWith("##");
      out.push(...blanks);
      if (nextIsHeading && !hasSep) {
        out.push("---", "");
        changed = true;
      }
      i = j;
      continue;
    }
    i++;
  }

  if (changed) {
    await writeFile(p, out.join("\n"));
    console.log(`fixed: ${relative(wiki, p)}`);
    fixed++;
  }
}

console.log(`${fixed} files updated`);
