import assert from "node:assert/strict";
import test from "node:test";
import { fetchPrSnapshot, mapGhPrView } from "../src/gh-snapshot.js";
import { run } from "../src/triage-pr.js";
import type { PrSnapshot } from "../src/types.js";

const snapshot: PrSnapshot = {
  title: "Small fix",
  body: "Description",
  files: [{ path: "src/a.ts", additions: 4, deletions: 1 }],
  ci: [{ name: "test", status: "SUCCESS" }],
  review_threads: { reviews: [], comments: [] }
};

test("maps gh output to a compact snapshot without patch content", () => {
  const mapped = mapGhPrView({
    title: "Small fix",
    body: "Description",
    files: [{ path: "src/a.ts", additions: 4, deletions: 1, patch: "secret diff" }],
    statusCheckRollup: [{ name: "test", status: "COMPLETED", conclusion: "SUCCESS" }],
    reviews: [{ author: { login: "reviewer" }, state: "APPROVED", body: "looks good" }],
    comments: [{ author: { login: "author" }, body: "thanks" }]
  });
  assert.deepEqual(mapped.files, snapshot.files);
  assert.deepEqual(mapped.ci, snapshot.ci);
  assert.doesNotMatch(JSON.stringify(mapped), /secret diff|patch/);
});

test("fetch uses a read-only gh pr view command", async () => {
  let args: string[] = [];
  const mapped = await fetchPrSnapshot("owner/repo", 12, async (received) => {
    args = received;
    return JSON.stringify(snapshot);
  });
  assert.equal(mapped.title, "Small fix");
  assert.deepEqual(args.slice(0, 5), ["pr", "view", "12", "--repo", "owner/repo"]);
  assert.equal(args.includes("merge"), false);
  assert.equal(args.join(" ").includes("patch"), false);
});

test("PR CLI accepts both target forms and defaults to dry-run", async () => {
  for (const args of [["owner/repo#12"], ["--pr", "12", "--repo", "owner/repo"]]) {
    let liveCalled = false;
    let output = "";
    await run(args, {
      fetchSnapshot: async (repo, pr) => {
        assert.equal(repo, "owner/repo");
        assert.equal(pr, 12);
        return snapshot;
      },
      requestAdvice: async () => {
        liveCalled = true;
        throw new Error("unexpected live call");
      },
      output: (value) => (output = value)
    });
    assert.equal(liveCalled, false);
    assert.equal(JSON.parse(output).action, "merge");
  }
});

test("live mode reuses the live advice path", async () => {
  await assert.rejects(
    run(["owner/repo#12", "--live"], {
      fetchSnapshot: async () => snapshot,
      requestAdvice: async () => { throw new Error("OPENROUTER_API_KEY is required for live Jev triage"); }
    }),
    /OPENROUTER_API_KEY is required/
  );
});
