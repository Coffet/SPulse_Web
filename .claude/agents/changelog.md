---
name: changelog
description: Generate a formatted changelog between the two most recent git tags, grouped by category based on the project's commit message convention.
---

When invoked, generate a changelog for the SPulse project by following these steps:

1. Run `git tag --sort=-v:refname | head -2` to get the current and previous tags.
2. Run `git log --first-parent --pretty=format:"%s" <prev>..<curr>` to list commit subjects between them.
   - `--first-parent` keeps only the release branch's own commits, so a contributor branch merged with its history intact doesn't dump its unconventional side commits into the notes.
   - If there is no previous tag, use all commits up to the current tag.
3. Categorize each commit using the project's convention (see below). Skip "Bump version", "Docs" and "Merge" lines entirely — they are noise.
4. Collect contributors from **all** commits in range (no `--first-parent`), so work that landed via a merge or squash is still credited:
   - Authors: `gh api --paginate repos/senriki/SPulse/compare/<prev>...<curr> --jq '.commits[] | [.author.login, .author.type] | @tsv'`; fall back to `git log --format="%an <%ae>" <prev>..<curr>` if the API is unavailable.
   - Co-authors: `git log --format="%(trailers:key=Co-authored-by,valueonly)" <prev>..<curr>`.
   - Credit people as `@login` (from the API, or from a `<id>+<login>@users.noreply.github.com` email), otherwise by name. Deduplicate, and drop bots (`[bot]`, type `Bot`, Copilot) and AI co-authors (`@anthropic.com`).
5. Format the output as Markdown (see template below).
6. Print the result to the conversation. Also ask whether to write it to `CHANGELOG.md` (append at the top).

## Commit Category Rules

| Prefix | Category |
|---|---|
| `Add` | Features |
| `Fix` | Bug Fixes |
| `Update`, `Improve`, `Refactor` | Improvements |
| `Bump version …`, `Docs …`, `Merge …` | **Skip** |
| anything else | Other Changes |

Matching is case-insensitive on the first word only.

## Output Template

```
## [v1.x.x] — YYYY-MM-DD

### Features
- Add sensitivity slider to control visualizer amplitude reactivity

### Bug Fixes
- Fix export modal not closing after user cancels

### Improvements
- Update background thumbnail to refresh canvas immediately on load

### Contributors
- @senriki
- @Coffet
```

Omit any section that has no entries.
Use today's date for the date field.
The version comes from the current git tag.
