# Configurable wiki layout: `set-layout` skill

## Context

The template hard-codes three locations: sources in `sources/`, generated pages in `wiki/`, and `CLAUDE.md` + `sha.log`
at the repo root. That fits Obsidian poorly, because Obsidian expects the vault at the root; the README's workaround is
to open `wiki/` as the vault. The user wants the layout to be **configurable**, so each user of the template can choose
the current layout or a root-vault layout.

## Approaches (decided)

- **Set-layout skill (picked by the user).** A one-time skill rewrites the hard-coded paths across the repo and moves the
  existing content. At runtime everything stays as plain, literal paths.
- Settings file read at runtime (rejected by the user): less drift, but every script, tool and instruction would need
  an extra step to look up the layout.
- Environment variables in `mise.toml` (rejected): interactive Claude sessions may not see them.

The main risk with this approach is drift: a file added later that mentions a path gets missed. To counter it, the
skill **finds the paths by searching for them** instead of working from a fixed list of files.

## Design

### 1. Layout marker (my call)

`CLAUDE.md` → *Folder structure* gets one machine-readable line, which is the record of the current layout:
`<!-- layout: wikiDir=wiki sourcesDir=sources -->`. The skill reads the old values from it and writes the new ones.

### 2. Make every layout safe first (prerequisite edits, done once by hand now)

These changes make the repo safe when `wikiDir` is `.` (the repo root), so the skill only has to swap path strings:

- **`remove-source` skill**
  - Step 4 ("last source → delete everything inside `wiki/`") becomes: delete the section folders named in `sha.log`
    and the wiki `index.md` only. Never delete the wiki folder or its other contents.
  - Find the submodule's `.gitmodules` section by **path** (`git config -f .gitmodules --get-regexp '\.path$'`), not
    by assuming the name `submodule.sources/<name>`. After a move, the section name keeps the old path.
  - The module-dir guard `*/modules/sources/<name>` becomes `*/modules/*` (never the superproject's `.git`). After a
    move, the git dir stays at `.git/modules/<old path>`.
- **`add-source` skill**
  - In verify step 8, "every folder under `wiki/` except `wiki/img/` has an `index.md`" is limited to section
    folders, so it never sweeps up `.claude/`, `scripts/` and so on when the wiki is the root.
  - Step 6 builds the section list from `<wikiDir>/<name>/index.md` for each name in `sha.log`, not from
    `wiki/*/index.md`.
- **`tools/*.mts`**
  - Each tool starts with a single `const WIKI_DIR = "wiki";` constant.
  - The tools share an exclude list: `README.md`, `CLAUDE.md`, `.claude/**`, `.github/**`, `node_modules/**`, the
    sources folder and dot-folders. They glob `${WIKI_DIR}/**/*.md` minus those exclusions.
  - `find-orphans` compares against `${WIKI_DIR}/index.md` and `${WIKI_DIR}/img/`.
- **`CLAUDE.md`**
  - Gets the layout marker.
  - The *Folder structure* text says the wiki folder may be the repo root.

### 3. The `set-layout` skill (`.claude/skills/set-layout/SKILL.md`)

- Invoked as `/set-layout <wikiDir> <sourcesDir>`, e.g. `/set-layout . .sources` (vault at the root) or
  `/set-layout wiki sources` (the default). It is user-invoked only (`disable-model-invocation: true`) and, like the
  other skills, never commits.
- **Procedure:**
  1. **Parse and validate.**
     - Normalise both arguments (strip `./` and the trailing `/`).
     - `sourcesDir` must not be `.` and must not be the same as `wikiDir` or nested in it.
     - Read the old values from the marker. If old equals new, report that and stop.
  2. **Preflight. If anything would collide, stop and ask, having changed nothing.**
     - The target sources folder exists and is non-empty.
     - The target wiki folder already holds files with the same names as files being moved. Moving to the root
       collides on `index.md` and on any section folder name such as `scripts`, `tools` or `docs`.
     - The working tree is dirty.
  3. **Move the content with `git mv`.**
     - Move each submodule `<old>/<n>` to `<new>/<n>`. `git mv` updates `.gitmodules` `path` and the gitlink.
     - Move each wiki item: `index.md`, the section folders and `img/`.
     - Remove the old folders if they are empty. Wiki-internal links are relative, so they survive.
  4. **Rewrite the path references.**
     - `git grep` the tracked files, excluding the sources folder, for path-like uses of the old names: `sources/`,
       `wiki/`, `wiki/index.md`, `"wiki"`, `{{config_root}}/sources`, and in README links `./wiki/index.md`.
     - Rewrite each match with judgement. Change paths, leave prose words alone ("LLM Wiki", "wiki pages").
     - With `wikiDir=.`, `wiki/<x>` becomes `<x>` and "the `wiki/` folder" becomes "the wiki (repo root)".
     - This covers `CLAUDE.md`, both skills, `README.md`, `mise.toml` `resha`, `scripts/*.sh`, the
       `.github/workflows/*.sample` comments, `.vscode/settings.json` and the `tools/*.mts` `WIKI_DIR` constants and
       excludes, plus whatever else the search finds.
  5. **Root-vault extras (only when `wikiDir=.`).**
     - Move `CLAUDE.md` to `.claude/CLAUDE.md`. Claude Code loads it there, and Obsidian hides dot-folders.
     - Leave `sha.log` at the root: Obsidian ignores non-`.md` files.
     - Suggest a hidden `sourcesDir` (`.sources`) if a visible one was given, but don't force it.
     - When switching back to a non-root wiki, do the reverse.
  6. **Update the marker.**
  7. **Verify.**
     - `git grep` for the old paths returns only intentional prose.
     - `git submodule status` lists every submodule at its new path, and `.gitmodules` matches.
     - Every `sha.log` name has a folder under the new `sourcesDir`.
     - Every relative `.md` link in the wiki resolves.
     - `node tools/find-orphans.mts` runs and reports no non-wiki files.
     - Report the moves, the edited files, and that nothing is committed.
- **Common-mistakes table:**
  - Using `git submodule deinit` or re-adding submodules to move them (use `git mv`).
  - Rewriting prose that only looks like a path.
  - Deleting the old folder before checking that it's empty.
  - Committing.

### 4. Docs

- The README gets an "Obsidian vault at the root" subsection that explains `/set-layout . .sources`.
- `CLAUDE.md` mentions the skill under *Source code* / *Rules*: "change the layout only with `/set-layout`".

### Non-goals

- No runtime config lookup.
- Nothing is written to `.obsidian/`, which is gitignored.
- No support for more than one wiki folder or for nested source folders.

## Files

- New: `.claude/skills/set-layout/SKILL.md`
- Edited: `CLAUDE.md`, `.claude/skills/add-source/SKILL.md`, `.claude/skills/remove-source/SKILL.md`,
  `tools/find-orphans.mts`, `tools/fix-separators.mts`, `tools/sort-related-pages.mts`, `README.md`
- After approval: save this design to `docs/superpowers/specs/2026-11-24-configurable-layout-design.md` and commit it,
  then invoke `superpowers:writing-plans` for the step-by-step plan.

## Verification

Run this on a throwaway clone in the scratchpad:

1. **Set up fake content.**
   - Add a tiny local git repo as a submodule at `sources/demo`, with a matching `sha.log` line.
   - Add a hand-made `wiki/index.md` and `wiki/demo/index.md` with a relative link between them.
2. **Move to the root vault** with `/set-layout . .sources`, then check:
   - `git submodule status` shows `.sources/demo`.
   - `index.md` and `demo/` are at the root.
   - `CLAUDE.md` is now at `.claude/CLAUDE.md`.
   - `git grep -n 'wiki/\|sources/'` finds only intended prose.
   - All three `tools/*.mts` run cleanly and ignore `README.md` and the skills.
   - `bash -n scripts/*.sh` passes, and `mise run`/the `resha` alias rebuilds the same `sha.log`.
3. **Move back** with `/set-layout wiki sources`. `git diff` against the state from step 1 should be empty, apart from
   the `.gitmodules` section name.
4. **Test `remove-source demo` in the root layout.** It deletes only `demo/` and `index.md`, and leaves `README.md`,
   `scripts/` and `.claude/` alone.
