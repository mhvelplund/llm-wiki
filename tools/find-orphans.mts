#!/usr/bin/env -S node --experimental-strip-types
import { glob, readFile } from "node:fs/promises";
import { resolve, dirname, relative } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(import.meta.url), "../..");
const pages: string[] = [];
for await (const p of glob("wiki/**/*.md", { cwd: root })) pages.push(p);

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
      referenced.add(relative(root, resolve(srcDir, d.split("#")[0])));
    } catch {
      // ignore unresolvable paths
    }
  }
}

const orphans = pages
  .filter((p) => !p.includes("wiki/img/") && p !== "wiki/index.md" && !referenced.has(p))
  .sort();

console.log("=== ORPHAN PAGES (no inbound links) ===");
for (const o of orphans) console.log(`  ${o}`);
