# LLM Wiki

A personal knowledge base maintained by Claude Code. Based on Andrej Karpathy's LLM Wiki pattern.

## Purpose

This wiki is a structured, interlinked knowledge base for exploring and understanding the source repositories checked
out under `sources/`. Claude maintains the wiki. The human curates sources, asks questions, and guides the analysis.

## Folder structure

<!-- layout: wikiDir=wiki sourcesDir=sources -->

```text
sources/      -- Git repositories checked out as submodules (immutable -- never modify these)
wiki/         -- markdown pages maintained by Claude
wiki/index.md -- table of contents for the entire wiki
sha.log       -- source of truth for which repos are tracked, and the last Git SHA scanned for each
```

These are the default locations. The wiki folder may be the repo root (an Obsidian vault); the `layout` marker above
records the current layout. To list every wiki page, run `node --experimental-strip-types tools/wiki-pages.mts` rather
than searching the wiki folder, which may also hold the repo's tooling.

Every folder that holds wiki pages (the wiki folder itself and each section folder below it) should have an "index.md"
file as a landing page for that folder. The only exception is `wiki/img/` which is an assets-only folder and
intentionally has no index.md. When creating a new sub-folder for wiki pages, always create its `index.md` at the same
time. Folders that hold no wiki pages (tooling, `.claude/`, the sources) are not part of the wiki.

## Source code

The project is bootstrapped with a number of Git repositories, checked out as sub-modules, in the `sources/` directory.
`sha.log` is the authoritative list of which submodules are tracked and where each has been ingested to: each line is
`<name>: <sha>`, where `<name>` matches a folder under `sources/`. To find a repo's GitHub org/repo (for building the
deep-links in Page format below), read the submodule's remote from `.gitmodules`, or run
`git -C sources/<name> config --get remote.origin.url`.

To add a new repo, use the `add-source` skill with its clone URL (e.g. `/add-source
https://github.com/<org>/<repo>.git`). It also onboards a submodule already under `sources/` that has no entry in
`sha.log`. Don't use the ingest workflow below for that.

## Ingest workflow

When the user asks to update the wiki:

1. Read `sha.log` to determine which submodules under `sources/` are tracked, and the last SHA ingested for each.
2. (**If the `GH_PAT` environment variable is NOT set**) Pull the latest changes from Git for each tracked submodule.
3. Summarize the key changes that have occurred since the logged SHA for each module, highlighting new concepts or
   components, and things that have been deleted or deprecated.
4. Update the component pages in the `wiki/`, creating new pages for new components. Don't delete deleted or deprecated
   components, but clearly mark the information as outdated and note the commit SHA where the change happened.
5. Add mark-down to connect related pages
6. Update `wiki/index.md` with new pages and one-line descriptions
7. Update the last ingested SHA for each submodule in `sha.log`

A single submodule update may touch 10-15 wiki pages. That is normal.

## Page format

Every wiki page should follow this structure:

```markdown
# Page Title

**Summary**: One to two sentences describing this page.

**Sources**:
- [`path/to/file.ts`](https://github.com/<org>/<repo>/blob/<sha>/path/to/file.ts)
- [`path/to/dir/`](https://github.com/<org>/<repo>/tree/<sha>/path/to/dir)

**Last updated**: Date of most recent update, and a commit SHA that deep links to the commit in GitHub.

---

Main content goes here. Use clear headings and short paragraphs.

Link to related concepts using [page-name](path/to/document) throughout the text.

## Related pages

- [related-concept-1](path/to/concepts/1)
- [related-concept-2](path/to/concepts/2)
```

Each `**Sources**` bullet must deep-link the file at the exact commit SHA shown in `**Last updated**`. URL shape:
`https://github.com/<org>/<repo>/blob/<sha>/<path>` for files, `tree/<sha>/<path>` (no trailing slash in the URL) for
directories. `<org>/<repo>` comes from the submodule's GitHub remote (see Source code above) — matching the
`wiki/<name>/` section the page lives under.

## Citation rules

- Every factual claim should reference its source file
- Use the format (source: filename.pdf) after the claim
- If two sources disagree, note the contradiction explicitly
- If a claim has no source, mark it as needing verification

## Question answering

When the user asks a question:

1. Read `wiki/index.md` first to find relevant pages
2. Only read wiki pages (listed by `node --experimental-strip-types tools/wiki-pages.mts`). If that gives no results,
   read from `sources/`. Don't read anything else.
3. Read those pages and synthesize an answer
4. Cite specific wiki pages in your response
5. If the answer is not in the wiki, say so clearly
6. If the answer is valuable, offer to save it as a new wiki page

Good answers should be filed back into the wiki so they compound over time.

## Lint

When the user asks you to lint or audit the wiki:

Issues to fix automatically:

- Lists of links to pages and related pages should be sorted alphabetically (try to fix).

Issues to report:

- Check for contradictions between pages
- Find orphan pages (no inbound links from other pages)
- Identify concepts mentioned in pages that lack their own page
- Flag claims that may be outdated based on newer sources
- Check that all pages follow the page format above
- Report findings as a numbered list with suggested fixes

### Automatic linting

Every scheduled run (Wednesdays and Fridays at 21:00 UTC) includes an automated lint operation. When that happens we
temporarily rewind the `sha.log` a week. Don't worry about wiki references to files that are newer than the expected
SHA's in this case.

## Rules

- Never modify anything in the `sources/` folder
- Always update `wiki/index.md` and `sha.log` after changes
- Keep page names lowercase with hyphens (e.g. `machine-learning.md`)
- Write in clear, plain language
- When uncertain about how to categorize something, ask the user
- Change the folder layout only with the `set-layout` skill (`/set-layout <wikiDir> <sourcesDir>`); never move the
  wiki pages or the source submodules by hand
