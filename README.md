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

### Development

```sh
npm run check
npm test
```
