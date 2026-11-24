import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { listWikiPages, wikiPath } from "./wiki-pages.mts";

async function fixture(files: string[]): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), "wiki-pages-"));
  for (const f of files) {
    await mkdir(dirname(join(dir, f)), { recursive: true });
    await writeFile(join(dir, f), "# x\n");
  }
  return dir;
}

test("lists pages under wiki/ only", async () => {
  const dir = await fixture(["wiki/index.md", "wiki/demo/a.md", "README.md", "sources/x/README.md"]);
  assert.deepEqual(await listWikiPages(dir, "wiki", "sources"), ["wiki/demo/a.md", "wiki/index.md"]);
});

test("root wiki excludes repo machinery", async () => {
  const dir = await fixture([
    "index.md",
    "demo/a.md",
    "README.md",
    "CLAUDE.md",
    ".claude/skills/s/SKILL.md",
    ".sources/x/doc.md",
    "sources2/y.md",
    "docs/superpowers/specs/s.md",
    "node_modules/p/readme.md",
  ]);
  assert.deepEqual(await listWikiPages(dir, ".", "sources2"), ["demo/a.md", "index.md"]);
});

test("returns posix separators", async () => {
  const dir = await fixture(["wiki/index.md", "wiki/demo/deep/a.md"]);
  for (const p of await listWikiPages(dir, "wiki", "sources")) assert.ok(!p.includes("\\"), p);
});

test("missing wiki folder yields no pages", async () => {
  const dir = await fixture(["README.md"]);
  assert.deepEqual(await listWikiPages(dir, "wiki", "sources"), []);
});

test("wikiPath", () => {
  assert.equal(wikiPath(".", "index.md"), "index.md");
  assert.equal(wikiPath("wiki", "img/"), "wiki/img/");
});

test("nested wiki under a machinery-named folder still lists pages", async () => {
  const dir = await fixture(["docs/wiki/index.md", "docs/wiki/demo/a.md", "docs/other.md"]);
  assert.deepEqual(await listWikiPages(dir, "docs/wiki", "sources"), ["docs/wiki/demo/a.md", "docs/wiki/index.md"]);
});

test("root wiki skips a visible sources folder and tooling folders", async () => {
  const dir = await fixture(["index.md", "sources/x/README.md", "tools/t.md", "scripts/s.md", ".obsidian/o.md"]);
  assert.deepEqual(await listWikiPages(dir, ".", "sources"), ["index.md"]);
});
