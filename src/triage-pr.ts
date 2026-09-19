#!/usr/bin/env node
import { DRY_RUN_RESPONSE, mapJevResponse, requestJevAdvice } from "./jev.js";
import { fetchPrSnapshot } from "./gh-snapshot.js";
import type { PrSnapshot, TriageAdvice } from "./types.js";

function usage(): string {
  return "Usage: npm run triage:pr -- owner/repo#123 [--live]\n   or: npm run triage:pr -- --repo owner/repo --pr 123 [--live]";
}

export function parsePrArgs(argv: string[]): { repo: string; pr: number; live: boolean } {
  if (argv.includes("--help") || argv.includes("-h")) throw new Error(usage());
  const live = argv.includes("--live");
  const args = argv.filter((argument) => argument !== "--live");
  let repo: string | undefined;
  let prText: string | undefined;
  if (args.length === 1) {
    const match = /^([^/#\s]+\/[^/#\s]+)#(\d+)$/.exec(args[0] ?? "");
    if (match) [, repo, prText] = match;
  } else if (args.length === 4) {
    const repoIndex = args.indexOf("--repo");
    const prIndex = args.indexOf("--pr");
    if (repoIndex >= 0 && prIndex >= 0) {
      repo = args[repoIndex + 1];
      prText = args[prIndex + 1];
    }
  }
  const pr = Number(prText);
  if (!repo || !/^\S+\/\S+$/.test(repo) || !Number.isSafeInteger(pr) || pr < 1) {
    throw new Error(usage());
  }
  return { repo, pr, live };
}

type Dependencies = {
  fetchSnapshot?: (repo: string, pr: number) => Promise<PrSnapshot>;
  requestAdvice?: (snapshot: PrSnapshot) => Promise<TriageAdvice>;
  output?: (value: string) => void;
};

export async function run(argv: string[], dependencies: Dependencies = {}): Promise<void> {
  const { repo, pr, live } = parsePrArgs(argv);
  const snapshot = await (dependencies.fetchSnapshot ?? fetchPrSnapshot)(repo, pr);
  const advice = live
    ? await (dependencies.requestAdvice ?? requestJevAdvice)(snapshot)
    : mapJevResponse(DRY_RUN_RESPONSE);
  (dependencies.output ?? console.log)(JSON.stringify(advice, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`ship-ops: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
