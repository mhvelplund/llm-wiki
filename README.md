# LLM Wiki

This is an automated documentation site for the Git repositories checked out under `sources/`, based on the ideas of
Andrej Karpathy's [LLM Wiki] pattern.

Once its GitHub Actions are set up (see below), it runs automatically on a schedule and generates output in the
[wiki](./wiki/index.md) folder that is compatible with [Obsidian].

## Usage

### Improved RAG

Start Claude code in the root of the repo and ask questions about the code in natural language. Don't make changes to
code in `sources/*`. You should consider it read-only.

### Obsidian

You can also open the `wiki` folder in [Obsidian](https://obsidian.md/) to get a more traditional wiki experience, with
backlinks and graph view. Just make sure to set the vault to the `wiki` folder.

### Using the repo root as the vault

If you'd rather open the whole repo as your Obsidian vault, move the wiki to the repo root and hide the sources:

```plaintext
/set-layout . .sources
```

The `set-layout` skill moves the wiki pages to the root and the submodules to `.sources/` with `git mv`, moves
`CLAUDE.md` to `.claude/CLAUDE.md` (Obsidian ignores dot-folders), and rewrites every path in the skills, scripts and
tools. Then open the repo root as the vault. `/set-layout wiki sources` restores the default layout. Like the other
skills, it commits nothing.

## Managing sources

Sources are added and removed with two Claude Code skills, run from the root of the repo. Neither skill commits
anything, so you can review the result with `git status` / `git diff` and commit it yourself.

### Adding a source

Run `/add-source` with any URL you could pass to `git clone`, HTTPS or SSH. For example, to add the
[stl-browser](https://github.com/mhvelplund/stl-browser) repo:

```plaintext
/add-source https://github.com/mhvelplund/stl-browser.git
```

(`/add-source git@github.com:mhvelplund/stl-browser.git` does the same.) The skill:

1. Adds the repo as a submodule at `sources/stl-browser` (the folder name is the repo name).
2. Writes a new `wiki/stl-browser/` section: an overview, architecture pages (overview, folder layout, technology
   stack) and pages for the repo's main components, all deep-linked to the commit that was checked out.
3. Adds links between the new pages and related pages in other sections, if there are any.
4. Regenerates `wiki/index.md` so it lists every section.
5. Appends `stl-browser: <sha>` to `sha.log`, so the scheduled [updates](#updates) pick it up from there.

Existing sources and their wiki sections are left as they are. If `stl-browser` is already in `sha.log`, or a
`wiki/stl-browser/` folder already exists, the skill stops and asks instead of overwriting anything. If you've enabled
the GitHub Actions, also add the new repo to the `create-github-app-token` step in `wiki-run.yml` and install the GitHub
App on it (see [Setting up GitHub Actions](#setting-up-github-actions)).

Then commit:

```shell
git add .gitmodules sources/stl-browser sha.log wiki/
git commit -m "Add stl-browser source"
```

### Removing a source

Run `/remove-source` with the source's folder name under `sources/`:

```plaintext
/remove-source stl-browser
```

This removes the `sources/stl-browser` submodule, its `.gitmodules` entry and its `sha.log` line, and deletes the
`wiki/stl-browser/` section. Pages in other sections that linked to it are rewritten so they don't leave broken links,
and `wiki/index.md` is regenerated. If it was the last source, everything inside `wiki/` is deleted. If no source has
that name, the skill does nothing.

## Updates

Once set up (see [Setting up GitHub Actions](#setting-up-github-actions) below), the Wiki is kept up to date by a
scheduled GitHub Actions workflow that builds on a common [Wiki run](.github/workflows/wiki-run.yml.sample) reusable
workflow:

- **[Update wiki](.github/workflows/update-wiki.yml.sample)** runs at 21:00 UTC every Wednesday and Friday. It
  performs a full update _and_ lints the wiki, constrained to a budget of $15.00 per run. To catch anything missed
  since the last run, it first rewinds `sha.log` to each submodule's tip from one week ago, so the whole week's
  changes are re-scanned.

The workflow tracks the last ingested commit per submodule in `sha.log`, starting from those SHAs and advancing them as
pages are written. You can also trigger it manually from the Actions tab (`workflow_dispatch`), optionally overriding
the budget.

To perform an ad-hoc full update from Claude locally, run something like this prompt and commit the results:

```plaintext
Update the wiki and lint it, but ignore sha.log as the starting point. Instead, look at changes from the last 30 days.
```

## Setting up GitHub Actions

The workflows under `.github/workflows/` ship disabled, as `*.yml.sample` files, so a fresh clone doesn't
accidentally run automation configured for someone else's repos. To enable them:

1. For each `.github/workflows/<name>.yml.sample` you want to use, copy it to `.github/workflows/<name>.yml`
   (`verify-sha-log.yml.sample` needs no further editing; `wiki-run.yml.sample` and `update-wiki.yml.sample` do —
   see below).
2. In `wiki-run.yml`, replace the placeholders in the `create-github-app-token` step:
   - `<GITHUB_OWNER>` — your GitHub user or org.
   - `<WIKI_REPO_NAME>` / `<SOURCE_REPO_NAME>` — one line per repo the GitHub App needs access to: this wiki repo,
     plus every submodule listed in `.gitmodules` / `sha.log`.
3. Create a [GitHub App](https://docs.github.com/en/apps/creating-github-apps) with a `contents: write` permission,
   install it on the repos listed above, and set:
   - `WIKI_APP_ID` — repo variable, the App's client ID.
   - `WIKI_APP_PRIVATE_KEY` — repo secret, the App's private key.
4. Add an `ANTHROPIC_API_KEY` repo secret for the Claude runs.
5. Commit the enabled `.yml` files. GitHub only picks up workflows on the default branch.

## Refreshing the local workspace

Since sources are tracked as git submodules, refreshing the local checkout to get the newest info is a _little_ more
involved:

```shell
git pull --recurse-submodules --prune
```

<!-- External Links -->

[LLM Wiki]: https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
[Obsidian]: https://obsidian.md/
