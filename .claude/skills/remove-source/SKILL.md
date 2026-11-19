---
name: remove-source
description: Use when the user wants to remove a source repository from the wiki by name (e.g. "/remove-source spyo-map") — removes the sources/<name> submodule, its wiki section and sha.log entry, and rewrites wiki pages that linked to it. Never trigger automatically.
argument-hint: <source-name>
disable-model-invocation: true
---

# Remove source

## Purpose

Take one source out of the wiki: deinit and remove the `sources/<name>` submodule, delete its `wiki/<name>/` section,
drop its `sha.log` line, and rewrite every remaining wiki page that linked into the removed section so no dangling
links or stale references remain. Other sources are never touched.

## Procedure

### 1. Resolve the name — STOP if it doesn't exist

The name is the skill argument (`$ARGUMENTS`), trimmed, with any leading `sources/` and trailing `/` stripped.

The source exists iff **any** of these is true:

- `.gitmodules` has a submodule with `path = sources/<name>`
- `sources/<name>` exists
- `sha.log` has a line starting with `<name>:`

If the argument is empty, or none of the above holds: reply with one line, `No source named "<name>".`, and STOP.
Change nothing, run nothing else, don't offer alternatives.

### 2. Remove the submodule

```bash
# a. Find the submodule's own git dir BEFORE deinit (deinit empties the folder). It is under .git/modules/
#    normally, under .git/worktrees/<wt>/modules/ in a worktree, and absent if the submodule was never initialised.
moddir=$(git -C sources/<name> rev-parse --absolute-git-dir 2>/dev/null)
case "$moddir" in */modules/sources/<name>) ;; *) moddir= ;; esac   # never the superproject's own .git

# b. Deinit — skip if `git submodule status sources/<name>` starts with "-" (not initialised).
git submodule deinit -f sources/<name>

# c. Drop the gitlink and the .gitmodules section. Not `git rm`: it refuses when .gitmodules has other
#    unstaged changes.
git update-index --force-remove sources/<name>
git config -f .gitmodules --remove-section submodule.sources/<name>
git config --remove-section submodule.sources/<name> 2>/dev/null   # local .git/config entry, left if (b) was skipped
rm -rf sources/<name>

# d. Delete the module git dir found in (a), so re-adding the repo later works.
[ -n "$moddir" ] && rm -rf "$moddir"
```

Skip any command whose target doesn't exist (no `.gitmodules` section, no index entry, no folder). Do not commit —
leave that to the user.

### 3. Update `sha.log`

Delete the `<name>: …` line. Keep every other line exactly as it was, including line endings. If no lines remain, leave
the file empty (don't delete it).

### 4. Last source? Empty the wiki and finish

If `sources/` now contains no submodule folders and `sha.log` is empty: delete everything inside `wiki/` (keep the
`wiki/` folder itself), then skip to step 7.

### 5. Delete the section and rewrite pages that linked to it

1. Delete `wiki/<name>/` recursively.
2. Find every remaining page that references the removed section — any relative Markdown link whose target resolves
   into `wiki/<name>/`, plus mentions of `sources/<name>`:
   `grep -rlE '(\]\([^)]*\b<name>/|sources/<name>\b)' wiki/`
3. Skip `wiki/index.md` here (step 6 regenerates it). If no other pages match, go to step 6.
4. Otherwise dispatch one `general-purpose` subagent with the list of pages, the removed `name`, and these instructions:
   - Rewrite each page so it reads naturally without the removed source: delete *Related pages* bullets that point into
     `wiki/<name>/`; in prose, remove the link and rephrase or drop the sentence if it only made sense as a
     cross-reference. Keep the page's own content about its own source.
   - Drop **Sources** bullets that point at the removed repo.
   - Set **Last updated** to today's date, keeping the page's existing commit link (the page's own source didn't
     change).
   - Follow the repo `CLAUDE.md` *Page format*; keep link lists alphabetical.
   - Don't touch `sources/`, `sha.log` or `wiki/index.md`.
   - Return the list of edited files.

### 6. Regenerate `wiki/index.md`

Same rules as the `add-source` skill, step 6: read the current file, keep its title, Summary and intro prose, and
rebuild **Sources** (one bullet per remaining `sha.log` line), `## Sections` and `## Related pages` from the
`wiki/*/index.md` files on disk, sorted alphabetically. **Last updated**: today, noting that `<name>` was removed.

### 7. Verify before reporting

- `sources/<name>` doesn't exist; `.gitmodules` has no `sources/<name>` entry; `git submodule status` doesn't list it;
  the module git dir found in step 2a is gone.
- `sha.log` has no `<name>:` line, and every other line is unchanged (`git diff sha.log` shows a single removed line).
- `wiki/<name>/` is gone. If it was the last source, `wiki/` is empty.
- Otherwise: `grep -rE '(\]\([^)]*\b<name>/|sources/<name>\b)' wiki/` returns nothing, and every relative `.md` link in
  the edited pages and `wiki/index.md` resolves to a file on disk.
- `git status --porcelain sources/` shows nothing but the removal.

Report: the submodule removed, the pages rewritten, and that nothing is committed.

## Common mistakes

| Mistake | Fix |
|---|---|
| Guessing a similar name when the source doesn't exist | Print one line and STOP |
| Leaving the module git dir behind (re-adding later fails) | Locate it before deinit (step 2a), delete it after |
| Using `git rm` on the submodule | Fails if `.gitmodules` has other unstaged edits; use step 2c |
| Deleting pages that merely linked to the removed source | Rewrite them; only `wiki/<name>/` is deleted |
| Deleting the `wiki/` folder itself when the last source goes | Delete its contents only |
| Committing the result | Leave it uncommitted for the user |
