export const ACTIONS = ["merge", "fix_first", "hitl"] as const;

export type TriageAction = (typeof ACTIONS)[number];

export interface PrSnapshot {
  title: string;
  body: string;
  files: unknown;
  ci: unknown;
  review_threads: unknown;
}

export interface TriageAdvice {
  action: TriageAction;
  confidence: number;
  reasons: string[];
  checks: { ci: string; scope: string; risk: string };
  next_steps: string[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === "string");
}

export function validatePrSnapshot(value: unknown): PrSnapshot {
  if (!isRecord(value)) throw new Error("PR snapshot must be a JSON object");
  for (const key of ["title", "body"] as const) {
    if (typeof value[key] !== "string") {
      throw new Error(`PR snapshot field '${key}' must be a string`);
    }
  }
  for (const key of ["files", "ci", "review_threads"] as const) {
    if (!(key in value)) throw new Error(`PR snapshot is missing field '${key}'`);
  }
  return value as unknown as PrSnapshot;
}

export function validateTriageAdvice(value: unknown): TriageAdvice {
  if (!isRecord(value)) throw new Error("Triage advice must be an object");
  if (!ACTIONS.includes(value.action as TriageAction)) {
    throw new Error("Triage advice has an invalid action");
  }
  if (
    typeof value.confidence !== "number" ||
    !Number.isFinite(value.confidence) ||
    value.confidence < 0 ||
    value.confidence > 1
  ) {
    throw new Error("Triage advice confidence must be between 0 and 1");
  }
  if (!isStringArray(value.reasons) || !isStringArray(value.next_steps)) {
    throw new Error("Triage advice reasons and next_steps must be string arrays");
  }
  if (
    !isRecord(value.checks) ||
    typeof value.checks.ci !== "string" ||
    typeof value.checks.scope !== "string" ||
    typeof value.checks.risk !== "string"
  ) {
    throw new Error("Triage advice checks must contain ci, scope, and risk strings");
  }
  return value as unknown as TriageAdvice;
}
