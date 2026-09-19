import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { DRY_RUN_RESPONSE, mapJevResponse, requestJevAdvice } from "../src/jev.js";
import { validatePrSnapshot, validateTriageAdvice } from "../src/types.js";

const fixtureUrl = new URL("../fixtures/pr-snapshot.json", import.meta.url);

async function fixture() {
  return validatePrSnapshot(JSON.parse(await readFile(fixtureUrl, "utf8")));
}

test("fixture produces stable, valid dry-run advice", async () => {
  await fixture();
  const advice = validateTriageAdvice(mapJevResponse(DRY_RUN_RESPONSE));
  assert.deepEqual(advice, {
    action: "merge",
    confidence: 0.88,
    reasons: [
      "Jev proposed 'merge' with 88% confidence.",
      "CI acceptable: yes; scope appropriate: yes; high risk: no."
    ],
    checks: { ci: "passing or acceptable", scope: "focused", risk: "not high" },
    next_steps: ["Confirm branch protections and merge manually when ready."]
  });
});

test("low confidence always forces human-in-the-loop", () => {
  const advice = mapJevResponse({
    answers: {
      action: { choice: "merge", confidence: 0.54 },
      ci_ok: { choice: "yes" },
      scope_ok: { choice: "yes" },
      risk_high: { choice: "no" }
    }
  });
  assert.equal(advice.action, "hitl");
  assert.match(advice.reasons.at(-1) ?? "", /below the 0\.55/);
});

test("live request without an API key fails before fetch", async () => {
  const previous = process.env.OPENROUTER_API_KEY;
  delete process.env.OPENROUTER_API_KEY;
  let called = false;
  try {
    await assert.rejects(
      requestJevAdvice(await fixture(), {
        fetchImpl: async () => {
          called = true;
          return new Response();
        }
      }),
      /OPENROUTER_API_KEY is required/
    );
    assert.equal(called, false);
  } finally {
    if (previous === undefined) delete process.env.OPENROUTER_API_KEY;
    else process.env.OPENROUTER_API_KEY = previous;
  }
});
