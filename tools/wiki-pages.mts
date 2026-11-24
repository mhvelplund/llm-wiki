#!/usr/bin/env -S node --experimental-strip-types
/**
 * Layout-aware listing of wiki pages. WIKI_DIR and SOURCES_DIR are the only folder names the tools depend on; the
 * set-layout skill rewrites these two lines. Run directly to print every wiki page, one per line.
 */
import { glob } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const WIKI_DIR = "wiki";
export const SOURCES_DIR = "sources";

/** Top-level repo entries that are never wiki pages, even when the wiki is the repo root. */
const TOP_LEVEL_EXCLUDES = new Set(["README.md", "CLAUDE.md", "docs", "scripts", "tools"]);

export function wikiPath(wikiDir: string, rel: string): string {
  return wikiDir === "." ? rel : `${wikiDir}/${rel}`;
}

function isExcluded(path: string, sourcesDir: string): boolean {
  const segments = path.split("/");
  if (TOP_LEVEL_EXCLUDES.has(segments[0])) return true;
  if (segments.some((s) => s.startsWith(".") || s === "node_modules")) return true;
  return path === sourcesDir || path.startsWith(`${sourcesDir}/`);
}

/** Sorted, repo-relative, POSIX-separated paths of every wiki page under `wikiDir`. */
export async function listWikiPages(root: string, wikiDir = WIKI_DIR, sourcesDir = SOURCES_DIR): Promise<string[]> {
  const pages: string[] = [];
  try {
    for await (const p of glob("**/*.md", { cwd: resolve(root, wikiDir) })) {
      const rel = wikiPath(wikiDir, p.replaceAll("\\", "/"));
      if (!isExcluded(rel, sourcesDir)) pages.push(rel);
    }
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
  }
  return pages.sort();
}

if (import.meta.main) {
  const root = resolve(fileURLToPath(import.meta.url), "../..");
  for (const p of await listWikiPages(root)) console.log(p);
}
