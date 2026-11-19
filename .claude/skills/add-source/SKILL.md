---
name: add-source
description: Use when the user wants to add a new Git repository (given as a clonable HTTPS or SSH URL) as a wiki source — adds it as a submodule under sources/, writes its wiki section, cross-links it, regenerates wiki/index.md and records its SHA in sha.log. Also use for a submodule already checked out under sources/ but missing from sha.log. Never trigger automatically.
argument-hint: <git-url>
disable-model-invocation: true
---

# Add source

## Purpose

Add one Git repository to the wiki in a single pass: register it as a submodule under `sources/<name>`, write a
`wiki/<name>/` section for it, cross-link it with the existing sections, regenerate `wiki/index.md`, and append its HEAD
SHA to `sha.log`. Existing sources and their wiki sections are never removed or rewritten.

This is the *first-time documentation pass* for a repo. Updating an already-tracked source is the **Ingest workflow** in
the repo `CLAUDE.md` — not this skill.

## Procedure

### 1. Parse the URL

The URL is the skill argument (`$ARGUMENTS`). If it is empty, ask the user for one and stop.

| Input form      | Example                                                                         |
|-----------------|---------------------------------------------------------------------------------|
| HTTPS           | `https://github.com/mhvelplund/stl-browser.git` (the `.git` suffix is optional) |
| SSH (scp-style) | `git@github.com:mhvelplund/stl-browser.git`                                     |
| SSH (URL-style) | `ssh://git@github.com/mhvelplund/stl-browser.git`                               |

Derive:

- `host`, `org`, `repo` (strip a trailing `.git` and trailing `/`).
- `name` = `repo` → the submodule path is `sources/<name>` and the wiki section is `wiki/<name>/`.
- `web` = `https://<host>/<org>/<repo>` — used for every deep-link, even when the clone URL is SSH.

### 2. Preflight — stop and ask on any conflict, editing nothing

1. Read `sha.log` (missing file = no tracked sources). If a line starts with `<name>:`, the repo is already tracked:
   tell the user to use the Ingest workflow and stop.
2. If `wiki/<name>/` exists, stop and ask — it probably comes from a partial earlier run.
3. If `sources/<name>` exists:
   - It is a submodule (`sources/<name>/.git` exists) whose `git -C sources/<name> config --get remote.origin.url`
     points at the same `<host>/<org>/<repo>` → reuse it, skip step 3.
   - It exists but has no `.git` → it is registered but not initialised; run
     `git submodule update --init sources/<name>` and reuse it.
   - Anything else (different remote, plain folder) → stop and ask.

### 3. Add the submodule

```bash
git submodule add <url> sources/<name>
git submodule update --init sources/<name>
sha=$(git -C sources/<name> rev-parse HEAD)
```

Use the URL exactly as the user gave it. Do not commit — leave staging and committing to the user. From here on, never
modify anything under `sources/`.

If `git submodule add` fails (auth, typo, network), report git's error and clean up any half-made state:
`git submodule deinit -f sources/<name>`, `git rm -f sources/<name>`, and remove `.git/modules/sources/<name>` (for a
worktree, the modules dir is under `git rev-parse --git-dir`). Then stop.

### 4. Document the repo — one subagent

Dispatch one `general-purpose` subagent (it reads a lot of source; keep that out of the main context). Its prompt must
contain:

- `name`, absolute path of `sources/<name>`, `sha`, `web`, and the commit URL `<web>/commit/<sha>`.
- Target folder `wiki/<name>/`.
- "Open the repo `CLAUDE.md` and follow its **Page format** and **Citation rules** sections exactly." Spell out the
  parts that are easy to miss:
  - **Sources** bullets deep-link at the SHA: `<web>/blob/<sha>/<path>` for files, `<web>/tree/<sha>/<path>` for folders
    (no trailing slash in the URL).
  - **Last updated**: today's date and `` [`<short-sha>`](<web>/commit/<sha>) ``.
  - Links between pages are ordinary relative Markdown links, e.g. `[overview](architecture/overview.md)` or
    `[worker](../packages/worker.md)` — never `[[wiki-links]]`.
  - Every folder gets an `index.md` landing page that links all its children.
  - Filenames lowercase-with-hyphens; link lists and *Related pages* sorted alphabetically.
- Required minimum tree:
  - `wiki/<name>/index.md` — section overview, links every subfolder index.
  - `wiki/<name>/architecture/index.md`, `overview.md`, `folder-layout.md`, `technology-stack.md`.
  - Plus subfolders for the repo's major components (e.g. `packages/`, `apps/`, `components/`, `concepts/`,
    `operations/` — whatever fits), at most ~8 pages per folder. Look at an existing section such as `wiki/spyo-map/`
    for the expected shape and depth. Decide the tree before writing pages.
- No-touch list: anything under `sources/`, any other `wiki/<section>/`, `wiki/index.md`, `sha.log`.
- Return value: the list of files created, each with a one-line description.

### 5. Cross-link — one linker subagent, only if other sections exist

Skip this step if `wiki/<name>/` is the only section folder under `wiki/`.

Otherwise dispatch one `general-purpose` subagent with:

- The file list returned in step 4, and the list of all other wiki pages (`find wiki -name '*.md'`).
- Task: where a new page and an existing page genuinely share a concept (same library, protocol, pattern, data format,
  shared dependency…), add a relative Markdown link in the prose of both and a bullet in both *Related pages* sections
  (kept alphabetical). No link where no real relationship exists — zero links is a valid outcome.
- No-touch list: `sources/`, `wiki/index.md`, `sha.log`. It may edit existing sections' pages only to add links.
- Return value: list of edited files.

### 6. Regenerate `wiki/index.md` (main agent)

Read the current `wiki/index.md` first (if any), then rewrite it in the CLAUDE.md page format:

- `# Knowledge Base` (or the existing title).
- **Summary**: keep the existing one; otherwise one sentence describing the wiki.
- **Sources**: one bullet per `sha.log` entry (including the new one): `` `sources/<n>` `` linking to
  `<web>/commit/<sha>` for that source.
- **Last updated**: today, plus the commit link of the newly added source.
- `---`, then the existing intro prose (keep it; don't invent new text).
- `## Sections`: one bullet per `wiki/*/index.md`, sorted alphabetically, `[<n>](<n>/index.md) — <one line>`, where the
  line comes from that section index's **Summary**.
- `## Related pages`: the same section links, alphabetical.

### 7. Append to `sha.log`

Add `<name>: <sha>`. Keep existing lines untouched and match the file's line-ending and trailing-newline style.

### 8. Verify before reporting

Run each and fix anything that fails:

- `git submodule status sources/<name>` shows the submodule; `.gitmodules` has its entry.
- Every folder in `sources/` has a `sha.log` line.
- `wiki/<name>/index.md` and the four `architecture/` pages exist.
- Every folder under `wiki/` except `wiki/img/` has an `index.md`.
- Every relative `.md` link in `wiki/<name>/`, in pages the linker edited, and in `wiki/index.md` resolves to a file on
  disk (resolve each target relative to the page containing it).
- No `[[wiki-links]]` syntax in `wiki/<name>/`.
- `git status --porcelain sources/` lists nothing except the new submodule.

Report: the submodule added (path + short SHA), the pages created, the cross-links added, and that nothing is committed
yet.

## Common mistakes

| Mistake                                                       | Fix                                                   |
|---------------------------------------------------------------|-------------------------------------------------------|
| Deep-links built from the SSH URL (`git@github.com:…/blob/…`) | Always use `web` (`https://<host>/<org>/<repo>`)      |
| `[[wiki-links]]` in pages                                     | Relative Markdown links                               |
| Subfolder without `index.md`                                  | Every wiki folder gets one                            |
| Rebuilding `wiki/index.md` from memory and dropping a section | Build the section list from `wiki/*/index.md` on disk |
| Rewriting `sha.log` and losing existing lines                 | Append only                                           |
| Committing the result                                         | Leave it uncommitted for the user                     |
