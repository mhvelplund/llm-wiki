# Configurable Wiki Layout Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a template user move the wiki to the repo root (Obsidian vault) or anywhere else, and the sources folder
anywhere, via a `/set-layout <wikiDir> <sourcesDir>` skill.

**Architecture:** First make everything layout-safe (no "delete the whole wiki folder", no `**/*.md` sweeps that catch
non-wiki files, submodules found by path not by name). Then a prose skill rewrites literal paths repo-wide and `git mv`s
the content. The current layout is recorded in a marker comment in `CLAUDE.md`.

**Tech Stack:** Claude Code skills (Markdown), Node 24 `.mts` scripts run with `--experimental-strip-types`, `node:test`,
git submodules, bash.

**Spec:** `docs/superpowers/specs/2026-11-24-configurable-layout-design.md`

## Global Constraints

- Never modify anything under the sources folder (`sources/` today).
- Skills never commit; they leave changes for the user.
- Layout marker, exact form: `<!-- layout: wikiDir=wiki sourcesDir=sources -->` (in `CLAUDE.md` → *Folder structure*).
- Root-vault layout: `wikiDir=.`, `CLAUDE.md` lives at `.claude/CLAUDE.md`, `sha.log` stays at repo root.
- `sourcesDir` must not be `.`, equal `wikiDir`, or be nested inside a non-root `wikiDir`.
- Node 24.14.0 (from `mise.toml`); no new npm dependencies, no `package.json`.
- Page names lowercase-with-hyphens; link lists alphabetical (repo `CLAUDE.md`).

**Deviation from spec (my call):** instead of a `WIKI_DIR` constant in each of the three tools, one shared module
`tools/wiki-pages.mts` holds `WIKI_DIR`, `SOURCES_DIR` and the page lister. Same intent (one obvious string to rewrite),
less duplication.

## Review Focus

1. **Windows paths** — `fs.glob` returns `wiki\demo\index.md` on Windows; the old `p.includes("wiki/img/")` silently
   never matched. Expect: lister returns POSIX paths on every OS. Test in Task 1.
2. **Root wiki sweeping non-wiki files** — with `wikiDir="."`, `README.md`, `CLAUDE.md`, `.claude/skills/*/SKILL.md`,
   `docs/**`, the sources folder and `node_modules` must not be treated as pages. Test in Task 1.
3. **Submodule whose `.gitmodules` section name is the old path** after a move — `remove-source` must still find and
   remove it. Exercised in Task 6, step 5.
4. **Prose that looks like a path** — `llm-wiki/`, "the wiki pages", Karpathy's "LLM Wiki" must survive a rewrite.
   Checked in Task 6 by grep after the round trip.
5. **Uninitialised submodule** (cloned without `--recurse-submodules`) during `/set-layout` — move must still work on the
   gitlink, or the skill must stop and say to run `git submodule update --init`. Task 6, step 2 tests this case.

---

### Task 1: Shared, layout-safe wiki page lister

**Files:**
- Create: `tools/wiki-pages.mts`
- Create: `tools/wiki-pages.test.mts`
- Modify: `tools/find-orphans.mts`, `tools/fix-separators.mts`, `tools/sort-related-pages.mts` (replace the
  `glob("wiki/**/*.md")` loops and the `wiki` path constants)

**Interfaces:**
- Produces (`tools/wiki-pages.mts`):
  - `export const WIKI_DIR = "wiki";` and `export const SOURCES_DIR = "sources";` — the only layout strings in `tools/`;
    `/set-layout` rewrites these two lines.
  - `export async function listWikiPages(root: string, wikiDir = WIKI_DIR, sourcesDir = SOURCES_DIR): Promise<string[]>`
    — sorted, repo-relative, POSIX-separated `.md` paths under `wikiDir`, excluding: top-level `README.md` and
    `CLAUDE.md`, any path segment starting with `.` (covers `.claude/`, `.github/`, `.obsidian/`, `.sources/`),
    `node_modules/`, `docs/`, `scripts/`, `tools/`, and anything under `sourcesDir`. Exclusions are evaluated relative to
    the repo root, so they are no-ops when `wikiDir="wiki"`.
  - `export function wikiPath(wikiDir: string, rel: string): string` — `wikiDir === "." ? rel : \`${wikiDir}/${rel}\``
    (used for `index.md` / `img/` comparisons).

- [ ] **Step 1: Write the failing tests** in `tools/wiki-pages.test.mts` (`node:test` + `node:assert/strict`), each
  building a fixture tree in `mkdtemp(os.tmpdir())`:
  - `lists pages under wiki/ only` — fixture `wiki/index.md`, `wiki/demo/a.md`, `README.md`, `sources/x/README.md`;
    `listWikiPages(dir, "wiki", "sources")` deep-equals `["wiki/demo/a.md", "wiki/index.md"]`.
  - `root wiki excludes repo machinery` — fixture `index.md`, `demo/a.md`, `README.md`, `CLAUDE.md`,
    `.claude/skills/s/SKILL.md`, `.sources/x/doc.md`, `sources2/y.md`, `docs/superpowers/specs/s.md`,
    `node_modules/p/readme.md`; `listWikiPages(dir, ".", "sources2")` deep-equals `["demo/a.md", "index.md"]`.
  - `returns posix separators` — every result from the first fixture has no `\\`.
  - `wikiPath` — `wikiPath(".", "index.md") === "index.md"`, `wikiPath("wiki", "img/") === "wiki/img/"`.

- [ ] **Step 2: Run and see it fail**
  Run: `node --experimental-strip-types --test tools/wiki-pages.test.mts`
  Expected: FAIL, cannot find module `./wiki-pages.mts`.

- [ ] **Step 3: Implement `tools/wiki-pages.mts`** with `fs.glob("**/*.md", { cwd: resolve(root, wikiDir) })`,
  prefix with `wikiDir` via `wikiPath`, convert `\` to `/`, filter as above, sort.

- [ ] **Step 4: Run tests, expect PASS** (same command).

- [ ] **Step 5: Switch the three tools to the module.**
  - All three: `const pages = await listWikiPages(root);`.
  - `find-orphans.mts`: filter becomes `!p.startsWith(wikiPath(WIKI_DIR, "img/")) && p !== wikiPath(WIKI_DIR, "index.md")`;
    normalise `relative(...)` results to `/` before `referenced.add`.
  - `fix-separators.mts` / `sort-related-pages.mts`: `const wiki = resolve(root, WIKI_DIR);`.

- [ ] **Step 6: Smoke-run the tools on an empty wiki**
  Run: `node --experimental-strip-types tools/find-orphans.mts && node --experimental-strip-types tools/fix-separators.mts && node --experimental-strip-types tools/sort-related-pages.mts`
  Expected: header line with no orphans, `0 files updated` twice, exit 0 (no `wiki/` folder exists yet — must not throw;
  if `fs.glob` throws on a missing cwd, return `[]` from `listWikiPages`).

- [ ] **Step 7: Commit** — `git add tools/ && git commit -m "refactor(tools): shared layout-safe wiki page lister"`

---

### Task 2: Make `remove-source` safe in any layout

**Files:**
- Modify: `.claude/skills/remove-source/SKILL.md`

**Interfaces:**
- Consumes: none. Produces: the skill text `/set-layout` will later path-rewrite.

- [ ] **Step 1: Step 1 (resolve name)** — "exists iff" check uses `.gitmodules` entries whose **path** ends in
  `/<name>` under `sources/`; look it up with `git config -f .gitmodules --get-regexp '\.path$'`, and record the
  section name (`submodule.<whatever>`) from the matching key for step 2c.
- [ ] **Step 2: Step 2a** — guard becomes `case "$moddir" in */modules/*) ;; *) moddir= ;; esac` with a comment that
  after `/set-layout` the module dir keeps its old path.
- [ ] **Step 3: Step 2c** — both `--remove-section` calls use the section name recorded in step 1, not
  `submodule.sources/<name>`.
- [ ] **Step 4: Step 4 (last source)** — replace "delete everything inside `wiki/`" with: delete `wiki/index.md` and the
  removed section folder; then, if `wiki/` is not the repo root and is now empty except `img/`, delete `img/` too. Never
  delete the wiki folder itself or any file not created by the wiki workflows.
- [ ] **Step 5: Step 5.2 grep** — restrict to wiki pages (`git ls-files 'wiki/**.md'`), not `grep -r wiki/` (so a root
  wiki doesn't grep `.claude/` or `sources/`).
- [ ] **Step 6: Step 7 verify + Common mistakes** — "If it was the last source, `wiki/` is empty" → "no section folders
  or `index.md` remain"; add a row: *Deleting the wiki folder's contents wholesale* → *Delete only `index.md` and the
  section folder — the wiki may be the repo root*.
- [ ] **Step 7: Check** — `grep -n 'everything inside\|submodule.sources/' .claude/skills/remove-source/SKILL.md`
  returns nothing.
- [ ] **Step 8: Commit** — `git commit -am "fix(remove-source): layout-safe deletes and submodule lookup by path"`

---

### Task 3: Make `add-source` safe in any layout

**Files:**
- Modify: `.claude/skills/add-source/SKILL.md`

- [ ] **Step 1: Step 4 subagent prompt** — "Look at an existing section such as `wiki/spyo-map/`" becomes "any existing
  section listed in `sha.log`" (spyo-map no longer exists in the template).
- [ ] **Step 2: Step 5** — "if `wiki/<name>/` is the only section folder under `wiki/`" becomes "if `sha.log` has no
  other entries"; the "list of all other wiki pages" comes from `node --experimental-strip-types tools/wiki-pages.mts`
  — add a 3-line CLI entry to `tools/wiki-pages.mts` (`if (import.meta.main)` prints `listWikiPages(root)` one per line)
  and use it instead of `find wiki -name '*.md'`.
- [ ] **Step 3: Step 6** — `## Sections` is built from `wiki/<n>/index.md` for each `<n>` in `sha.log` (sorted), not
  `wiki/*/index.md`. Same change in the Common-mistakes row.
- [ ] **Step 4: Step 8 verify** — "Every folder under `wiki/` except `wiki/img/` has an `index.md`" becomes "every
  folder under `wiki/<name>/` has an `index.md`".
- [ ] **Step 5: Check** — `grep -n "wiki/\*\|find wiki\|spyo-map" .claude/skills/add-source/SKILL.md` returns nothing;
  `node --experimental-strip-types tools/wiki-pages.mts` exits 0.
- [ ] **Step 6: Commit** — `git commit -am "fix(add-source): build section lists from sha.log, not folder sweeps"`

---

### Task 4: Layout marker in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (*Folder structure*, *Source code*, *Rules*)

- [ ] **Step 1:** Add the marker line exactly as in Global Constraints directly under `## Folder structure`.
- [ ] **Step 2:** Add one sentence after the folder tree: "These are the default locations. The wiki folder may be the
  repo root (an Obsidian vault); the marker above records the current layout."
- [ ] **Step 3:** In *Rules*, add: "Change the folder layout only with the `set-layout` skill (`/set-layout <wikiDir>
  <sourcesDir>`); never move `sources/` or `wiki/` by hand."
- [ ] **Step 4: Check** — `grep -c '<!-- layout: wikiDir=wiki sourcesDir=sources -->' CLAUDE.md` prints `1`.
- [ ] **Step 5: Commit** — `git commit -am "docs(CLAUDE.md): record folder layout marker"`

---

### Task 5: The `set-layout` skill + README

**Files:**
- Create: `.claude/skills/set-layout/SKILL.md`
- Modify: `README.md` (Obsidian section, new subsection "Using the repo root as the vault")

**Interfaces:**
- Consumes: marker (Task 4), `WIKI_DIR`/`SOURCES_DIR` lines in `tools/wiki-pages.mts` (Task 1), layout-safe skills
  (Tasks 2–3).

- [ ] **Step 1: Frontmatter** — `name: set-layout`, `argument-hint: <wikiDir> <sourcesDir>`,
  `disable-model-invocation: true`, description: "Use when the user wants to move the wiki folder (e.g. to the repo root
  for an Obsidian vault) or the sources folder — moves the content with git mv and rewrites every path reference.
  Never trigger automatically."
- [ ] **Step 2: Procedure** — write spec §3 steps 1–7 as numbered sections, in the style of `add-source/SKILL.md`
  (Purpose, Procedure, Common mistakes). Decisions to state explicitly in the text:
  - Arguments normalised by stripping a leading `./` and trailing `/`; empty `wikiDir` means `.`.
  - Preflight stops on: dirty tree (`git status --porcelain` non-empty), target sources folder non-empty, any
    collision between moved wiki items and existing root entries, any uninitialised submodule (`git submodule status`
    line starting with `-`) — tell the user to run `git submodule update --init` first.
  - Moves: `git mv <oldSrc>/<n> <newSrc>/<n>` per `sha.log` name (create the parent dir first); wiki items moved are
    `index.md`, each `<n>/` from `sha.log`, and `img/` if present — never a whole-folder `git mv` when either side is
    `.`.
  - Search: `git grep -nE '(^|[^a-z-])(<oldWiki>|<oldSrc>)(/|"|\x60)' -- . ':!<newSrc>'` plus the `CLAUDE.md` marker;
    each hit rewritten by judgement, and the two constants in `tools/wiki-pages.mts`.
  - Root extras: `git mv CLAUDE.md .claude/CLAUDE.md` when going to `.`; reverse when leaving `.`; recommend
    `.sources` if `sourcesDir` is visible and `wikiDir` is `.`.
  - Verify list from spec §3 step 7, using `node --experimental-strip-types tools/wiki-pages.mts` to show the page list
    contains no `README.md`/`.claude/` entries.
- [ ] **Step 3: Common mistakes table** — the four rows from spec §3, plus "Moving the whole folder with `git mv wiki .`"
  → "Move items one by one".
- [ ] **Step 4: README** — under *Obsidian*, add the subsection: run `/set-layout . .sources`, then open the repo root as
  the vault; `CLAUDE.md` moves to `.claude/CLAUDE.md`; `/set-layout wiki sources` goes back. Keep the existing
  "open `wiki/`" instructions as the default.
- [ ] **Step 5: Commit** — `git add .claude/skills/set-layout README.md && git commit -m "feat: set-layout skill for configurable wiki/sources folders"`

---

### Task 6: End-to-end round trip in a scratch clone

No repo files change unless this finds bugs (fix them in the owning task's file and re-run).

- [ ] **Step 1: Fixture** — in the scratchpad: `git clone <repo> e2e && cd e2e && git switch configurable-layout`;
  create a bare local repo `demo` with one commit; `git -c protocol.file.allow=always submodule add <path-to-demo> sources/demo`;
  write `sha.log` (`demo: <sha>`), `wiki/index.md` linking `demo/index.md`, `wiki/demo/index.md` linking back; commit.
- [ ] **Step 2: Uninitialised-submodule check** — `git submodule deinit -f sources/demo`, run `/set-layout . .sources`
  (in a `claude -p` session started in `e2e/`): expect it to stop and ask for `git submodule update --init`, changing
  nothing (`git status --porcelain` empty). Re-init.
- [ ] **Step 3: To root vault** — run `/set-layout . .sources`. Expect:
  - `git submodule status` shows `.sources/demo`; `index.md`, `demo/` at the root; `.claude/CLAUDE.md` exists, root
    `CLAUDE.md` doesn't; marker reads `wikiDir=. sourcesDir=.sources`.
  - `node --experimental-strip-types tools/wiki-pages.mts` prints exactly `demo/index.md` and `index.md`.
  - `node --experimental-strip-types tools/find-orphans.mts` lists no orphans; `bash -n scripts/*.sh` passes.
  - `git grep -nE '(^|[^a-z-])(wiki|sources)/' -- . ':!.sources' ':!docs'` shows only prose (e.g. "LLM Wiki").
- [ ] **Step 4: Back** — commit, run `/set-layout wiki sources`; `git diff <commit-from-step-1> -- . ':!.gitmodules'`
  is empty; `.gitmodules` differs at most in the section name.
- [ ] **Step 5: remove-source in root layout** — `/set-layout . .sources`, commit, then `/remove-source demo`. Expect
  `.sources/demo`, `demo/`, `index.md` and the `sha.log` line gone; `README.md`, `scripts/`, `tools/`, `.claude/` intact;
  `.gitmodules` empty; `.git/modules/sources/demo` gone.
- [ ] **Step 6: Run unit tests once more** — `node --experimental-strip-types --test tools/wiki-pages.test.mts` → PASS.
