---
name: set-layout
description: Use when the user wants to move the wiki folder (e.g. to the repo root, so the repo itself is an Obsidian vault) or the sources folder — moves the content with git mv and rewrites every path reference in the repo's instructions, skills, scripts and tools. Never trigger automatically.
argument-hint: <wikiDir> <sourcesDir>
disable-model-invocation: true
---

# Set layout

## Purpose

Move the wiki pages and the source submodules to new folders, and rewrite every literal path that refers to the old
folders, so the repo works the same afterwards. Typical uses:

| Command                     | Result                                                               |
|-----------------------------|----------------------------------------------------------------------|
| `/set-layout . .sources`    | Wiki at the repo root (open the repo as an Obsidian vault), hidden sources |
| `/set-layout wiki sources`  | The default layout                                                   |

The current layout is recorded in a marker line in `CLAUDE.md` (or `.claude/CLAUDE.md` when the wiki is the repo root):
`<!-- layout: wikiDir=<dir> sourcesDir=<dir> -->`. This skill is the only thing that changes it.

## Procedure

### 1. Parse and validate — STOP on any problem, changing nothing

- Arguments (`$ARGUMENTS`): `newWiki newSrc`. Normalise each: trim, strip a leading `./` and trailing `/`; an empty
  `newWiki` means `.`. If `newSrc` is missing, ask for it and stop.
- `newSrc` must not be `.`, must differ from `newWiki`, and must not be inside `newWiki` unless `newWiki` is `.`.
- `newWiki` is `.` or a plain relative folder that does not start with `.` (the page lister skips dot-folders).
- Read `oldWiki` and `oldSrc` from the marker in `CLAUDE.md` or `.claude/CLAUDE.md`. No marker → stop and say so.
- If both equal the new values, reply `Layout is already wikiDir=<w> sourcesDir=<s>.` and stop.

### 2. Preflight — STOP and ask on any conflict, changing nothing

1. `git status --porcelain` is empty. Otherwise ask the user to commit or stash first.
2. No line of `git submodule status` starts with `-`. Otherwise tell the user to run `git submodule update --init`
   first (an uninitialised submodule can't be moved safely).
3. If `newSrc` changes: the folder `newSrc` doesn't exist, or is empty.
4. If `newWiki` changes, build the **wiki item list** — the top-level entries of the wiki, relative to `oldWiki`:
   - the first path segment of every page printed by `node --experimental-strip-types tools/wiki-pages.mts`
     (run it now, before anything is rewritten), plus `img/` if `<oldWiki>/img/` exists;
   - if `oldWiki` is not `.`, every other tracked entry directly inside it too (`git ls-files <oldWiki>`).
   Every item must not already exist at `<newWiki>/<item>`. Moving to the root collides with `README.md`, `docs/`,
   `scripts/`, `tools/` and any other root entry with the same name.
5. If `newWiki` is `.`, `.claude/CLAUDE.md` must not exist; if `oldWiki` is `.`, root `CLAUDE.md` must not exist.

If `newWiki` is `.` and `newSrc` doesn't start with `.`, suggest `.sources` (Obsidian hides dot-folders, so the sources
stay out of the vault) and ask once whether to use it.

### 3. Move the content — `git mv` only

```bash
# Sources, one per sha.log name (git mv also updates .gitmodules `path` and the submodule's worktree setting):
mkdir -p <newSrc> && git mv <oldSrc>/<n> <newSrc>/<n>
# Wiki, one per item from step 2.4 — never `git mv wiki .` or `git mv . wiki`:
mkdir -p <newWiki> && git mv <oldWiki>/<item> <newWiki>/<item>
# CLAUDE.md, only when the wiki moves to or from the root:
git mv CLAUDE.md .claude/CLAUDE.md      # newWiki is .
git mv .claude/CLAUDE.md CLAUDE.md      # oldWiki is .
```

- An Obsidian config `<oldWiki>/.obsidian/` (git-ignored) moves with plain `mv` if `<newWiki>/.obsidian/` doesn't
  exist; otherwise leave it and mention it in the report.
- Then delete `oldSrc` and `oldWiki` if they are now empty (`rmdir`, never `rm -rf`; never for `.`).
- Links between wiki pages are relative and keep working. `.gitmodules` section names keep the old path — that's
  expected; `remove-source` looks submodules up by path.

### 4. Rewrite path references

Search the tracked files for path-like uses of the old folder names. Exclude the moved sources, the moved wiki pages,
`docs/superpowers/` (historical specs and plans), `tools/*.test.mts` (fixtures with explicit folder arguments) and this
skill's own folder (its examples name both layouts):

```bash
x=(':!<newSrc>' ':!docs/superpowers' ':!tools/*.test.mts' ':!.claude/skills/set-layout')
git grep -nE '(^|[^A-Za-z0-9._-])<oldSrc>(/|`|")' -- . "${x[@]}"
git grep -nE '(^|[^A-Za-z0-9._-])<oldWiki>(/|`|")' -- . "${x[@]}"   # when oldWiki isn't .
```

Also leave the README's *Using the repo root as the vault* subsection alone: it describes both layouts on purpose.

Rewrite each hit by judgement: change paths, never prose words ("LLM Wiki", "wiki pages", "source repositories",
"**Sources**"). Rules:

- `<oldSrc>/` → `<newSrc>/`, `` `<oldSrc>` `` → `` `<newSrc>` ``, `"<oldSrc>"` → `"<newSrc>"`.
- Wiki paths, old wiki not the root: `<oldWiki>/x` → `<newWiki>/x`. If the new wiki is the root, write `./x` instead,
  and `./<oldWiki>/x` becomes `./x`. A Markdown link target never needs the `./`: `(wiki/x)` → `(x)`.
- Old wiki at the root: `./x` paths that point into the wiki → `<newWiki>/x` (`./x` in a README link → `./<newWiki>/x`).
  Also look for wiki paths written without a prefix: `index.md`, `img/`, `<name>/` placeholders and sentences such as
  "the wiki folder (the repo root)". Read `CLAUDE.md` and the three skills (`add-source`, `remove-source`, this one)
  from top to bottom instead of relying on grep alone.
- Folder-name sentences such as "open the `wiki` folder" become "open the repo root" (and back).
- `tools/wiki-pages.mts`: set `WIKI_DIR` and `SOURCES_DIR` to the new values (`"."` for the root).
- Keep the alignment of the folder tree block in `CLAUDE.md`.

Typical hits: `CLAUDE.md`, `.claude/skills/*/SKILL.md`, `README.md`, `mise.toml` (`resha`), `scripts/*.sh`,
`.github/workflows/*.sample`, `.vscode/settings.json`, `tools/wiki-pages.mts` — plus anything else the search finds.

### 5. Update the marker

Write `<!-- layout: wikiDir=<newWiki> sourcesDir=<newSrc> -->` into the (possibly moved) `CLAUDE.md`.

### 6. Verify before reporting

Run each and fix anything that fails:

- The step 4 searches for the old names return only prose you left on purpose.
- `git submodule status` lists every submodule under `newSrc`, all without a `-` prefix; every `.gitmodules` `path` is
  under `newSrc`; every `sha.log` name has a folder `<newSrc>/<n>`.
- `node --experimental-strip-types tools/wiki-pages.mts` prints the same pages as in step 2.4, re-prefixed for the new
  wiki folder — and no `README.md`, `CLAUDE.md`, `.claude/`, `docs/` or sources entries.
- `node --experimental-strip-types --test tools/wiki-pages.test.mts` passes, and
  `node --experimental-strip-types tools/find-orphans.mts` runs.
- Every relative `.md` link in the wiki pages resolves to a file on disk.
- `bash -n scripts/*.sh` passes.
- The marker shows the new values, in `.claude/CLAUDE.md` exactly when `newWiki` is `.`.

Report: what moved where, the files rewritten, anything left for the user (a skipped `.obsidian/` folder; the GitHub
Actions, which need no change), and that nothing is committed. If the wiki is now the root, tell the user to open the
repo root as their Obsidian vault.

## Common mistakes

| Mistake                                                              | Fix                                                      |
|----------------------------------------------------------------------|----------------------------------------------------------|
| `git submodule deinit` / re-adding submodules to move them           | `git mv` each submodule                                  |
| `git mv wiki .` or moving the whole repo root into `wiki/`           | Move the wiki items one by one (step 2.4)                |
| Rewriting prose that only looks like a path ("LLM Wiki", "Sources")  | Only paths: followed by `/`, or the folder name in quotes/backticks |
| Rewriting `docs/superpowers/` or the test fixtures                   | Leave them; they're history and explicit arguments       |
| `rm -rf` of the old folder before checking it's empty                | `rmdir` only                                             |
| Renaming `.gitmodules` sections to match the new path                | Leave the names; only `path` changes                     |
| Committing the result                                                | Leave it uncommitted for the user                        |
