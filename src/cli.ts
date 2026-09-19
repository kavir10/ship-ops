#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { stdin } from "node:process";
import { DRY_RUN_RESPONSE, mapJevResponse, requestJevAdvice } from "./jev.js";
import { validatePrSnapshot } from "./types.js";

async function readStdin(): Promise<string> {
  const chunks: Buffer[] = [];
  for await (const chunk of stdin) chunks.push(Buffer.from(chunk));
  return Buffer.concat(chunks).toString("utf8");
}

function usage(): string {
  return "Usage: npm run triage -- [--dry-run] [snapshot.json]\nReads JSON from stdin when no file is supplied.";
}

export async function run(argv: string[]): Promise<void> {
  const dryRun = argv.includes("--dry-run");
  const positional = argv.filter((argument) => argument !== "--dry-run");
  if (positional.includes("--help") || positional.includes("-h")) {
    console.log(usage());
    return;
  }
  if (positional.length > 1 || positional.some((argument) => argument.startsWith("-"))) {
    throw new Error(usage());
  }

  const source = positional[0];
  const raw = source ? await readFile(source, "utf8") : await readStdin();
  if (!raw.trim()) throw new Error("PR snapshot input is empty");

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(`PR snapshot is not valid JSON: ${(error as Error).message}`);
  }
  const snapshot = validatePrSnapshot(parsed);
  const advice = dryRun ? mapJevResponse(DRY_RUN_RESPONSE) : await requestJevAdvice(snapshot);
  console.log(JSON.stringify(advice, null, 2));
}

if (import.meta.url === `file://${process.argv[1]}`) {
  run(process.argv.slice(2)).catch((error: unknown) => {
    console.error(`ship-ops: ${(error as Error).message}`);
    process.exitCode = 1;
  });
}
