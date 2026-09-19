# ship-ops

Small, advice-only tooling for safer software delivery operations.

## Jev PR triage

The `ship-ops` CLI sends a compact pull-request snapshot to OpenRouter's
`typesafe/jev-1.13` decision model and prints validated merge advice. It never
fetches or sends a full diff, and it never merges a pull request.

The input is a JSON object containing a PR's `title`, `body`, `files`, `ci`, and
`review_threads`. The output always has this shape:

```json
{
  "action": "merge | fix_first | hitl",
  "confidence": 0.8,
  "reasons": ["..."],
  "checks": { "ci": "...", "scope": "...", "risk": "..." },
  "next_steps": ["..."]
}
```

Jev results below the `0.55` confidence threshold are always changed to
`action: "hitl"` for human review.

### Install and run

Requires Node.js 20 or newer.

```sh
npm install
npm run triage -- --dry-run fixtures/pr-snapshot.json
cat fixtures/pr-snapshot.json | npm run triage -- --dry-run
```

Dry-run mode uses a deterministic fixture response, makes no network call, and
does not require credentials. For a live decision:

```sh
OPENROUTER_API_KEY=your-key npm run triage -- fixtures/pr-snapshot.json
cat fixtures/pr-snapshot.json | OPENROUTER_API_KEY=your-key npm run triage
```

`OPENROUTER_API_KEY` is required for every live call. Missing credentials cause
an immediate, non-zero failure. `SHIP_OPS_JEV=0` disables live calls; use
`--dry-run` when it is set.

### Daily open-PR triage

With the GitHub CLI installed and authenticated (`gh auth status`), fetch a
compact snapshot of an open pull request and run triage with:

```sh
npm run triage:pr -- owner/repo#123
# equivalent:
npm run triage:pr -- --repo owner/repo --pr 123
```

This command defaults to dry-run. It asks `gh` only for the PR title, a compact
body, file paths and change counts, CI status, reviews, and comments; it does
not fetch or send full diffs. To request real Jev advice, opt in explicitly:

```sh
OPENROUTER_API_KEY=your-key npm run triage:pr -- owner/repo#123 --live
```

Daily triage is recommend-only: this tool never merges a pull request. Humans
review its fixed-schema advice and make every merge decision. If GitHub is not
reachable, the existing recorded snapshot remains available as an offline
fallback:

```sh
npm run triage -- --dry-run fixtures/pr-snapshot.json
```

### Development

```sh
npm run check
npm test
```
