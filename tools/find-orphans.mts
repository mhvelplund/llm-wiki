#!/usr/bin/env -S node --experimental-strip-types
import { readFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { listWikiPages, WIKI_DIR, wikiPath } from "./wiki-pages.mts";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const pages = await listWikiPages(root);

const links: Record<string, string[]> = {};
for (const p of pages) {
  const text = await readFile(resolve(root, p), "utf8");
  links[p] = [...text.matchAll(/\[.*?\]\(([^)]+\.md[^)]*)\)/g)].map((m) => m[1]);
}

const referenced = new Set<string>();
for (const [src, dests] of Object.entries(links)) {
  const srcDir = dirname(resolve(root, src));
  for (const d of dests) {
    try {
      referenced.add(relative(root, resolve(srcDir, d.split("#")[0])).replaceAll("\\", "/"));
    } catch {
      // ignore unresolvable paths
    }
  }
}

const orphans = pages
  .filter((p) => !p.startsWith(wikiPath(WIKI_DIR, "img/")) && p !== wikiPath(WIKI_DIR, "index.md") && !referenced.has(p))
  .sort();

console.log("=== ORPHAN PAGES (no inbound links) ===");
for (const o of orphans) console.log(`  ${o}`);
