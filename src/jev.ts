import { validateTriageAdvice, type PrSnapshot, type TriageAction, type TriageAdvice } from "./types.js";

export const JEV_MODEL = "typesafe/jev-1.13";
export const JEV_ENDPOINT = "https://openrouter.ai/api/alpha/decisions";
export const LOW_CONFIDENCE_THRESHOLD = 0.55;

type ChoiceAnswer = {
  choice: string;
  confidence?: number;
  probabilities?: Record<string, number>;
};

export interface JevResponse {
  answers: {
    action: ChoiceAnswer;
    ci_ok?: ChoiceAnswer;
    scope_ok?: ChoiceAnswer;
    risk_high?: ChoiceAnswer;
  };
}

export const DRY_RUN_RESPONSE: JevResponse = {
  answers: {
    action: {
      choice: "merge",
      confidence: 0.88,
      probabilities: { merge: 0.88, fix_first: 0.08, hitl: 0.04 }
    },
    ci_ok: { choice: "yes", confidence: 0.96 },
    scope_ok: { choice: "yes", confidence: 0.9 },
    risk_high: { choice: "no", confidence: 0.82 }
  }
};

function answerChoice(answer: ChoiceAnswer | undefined, fallback: string): string {
  return typeof answer?.choice === "string" ? answer.choice : fallback;
}

function actionConfidence(answer: ChoiceAnswer): number {
  if (typeof answer.confidence === "number") return answer.confidence;
  const probability = answer.probabilities?.[answer.choice];
  if (typeof probability === "number") return probability;
  throw new Error("Jev action answer did not include confidence or a selected probability");
}

export function mapJevResponse(response: JevResponse): TriageAdvice {
  const proposed = answerChoice(response.answers?.action, "hitl");
  const confidence = actionConfidence(response.answers.action);
  const validAction: TriageAction = ["merge", "fix_first", "hitl"].includes(proposed)
    ? (proposed as TriageAction)
    : "hitl";
  const lowConfidence = confidence < LOW_CONFIDENCE_THRESHOLD;
  const action: TriageAction = lowConfidence ? "hitl" : validAction;
  const ci = answerChoice(response.answers.ci_ok, "unknown");
  const scope = answerChoice(response.answers.scope_ok, "unknown");
  const risk = answerChoice(response.answers.risk_high, "unknown");

  const reasons = [
    `Jev proposed '${validAction}' with ${(confidence * 100).toFixed(0)}% confidence.`,
    `CI acceptable: ${ci}; scope appropriate: ${scope}; high risk: ${risk}.`
  ];
  if (lowConfidence) {
    reasons.push(`Confidence is below the ${LOW_CONFIDENCE_THRESHOLD} human-review threshold.`);
  }

  const nextSteps =
    action === "merge"
      ? ["Confirm branch protections and merge manually when ready."]
      : action === "fix_first"
        ? ["Address the reported concerns, then request another review."]
        : ["Ask a human reviewer to make the final merge decision."];

  return validateTriageAdvice({
    action,
    confidence,
    reasons,
    checks: {
      ci: ci === "yes" ? "passing or acceptable" : ci === "no" ? "not acceptable" : "unknown",
      scope: scope === "yes" ? "focused" : scope === "no" ? "needs review" : "unknown",
      risk: risk === "yes" ? "high" : risk === "no" ? "not high" : "unknown"
    },
    next_steps: nextSteps
  });
}

export function buildDecisionRequest(snapshot: PrSnapshot): Record<string, unknown> {
  return {
    model: JEV_MODEL,
    state: JSON.stringify(snapshot),
    questions: {
      action: {
        type: "choice",
        instructions: "Recommend merge advice only. Consider CI, review threads, change scope, and risk.",
        criteria: {
          merge: "CI and reviews are acceptable, scope is focused, and risk is manageable.",
          fix_first: "A concrete issue should be fixed before a human considers merging.",
          hitl: "The decision is ambiguous, high risk, or needs human judgment."
        }
      },
      ci_ok: {
        type: "choice",
        instructions: "Is CI acceptable?",
        criteria: { yes: "CI is passing or acceptable.", no: "CI is failing or incomplete." }
      },
      scope_ok: {
        type: "choice",
        instructions: "Is the PR scope focused?",
        criteria: { yes: "The scope is coherent and reviewable.", no: "The scope is mixed or too broad." }
      },
      risk_high: {
        type: "choice",
        instructions: "Is the change high risk?",
        criteria: {
          yes: "The change has material safety or operational risk.",
          no: "The risk is limited and understood."
        }
      }
    }
  };
}

export async function requestJevAdvice(
  snapshot: PrSnapshot,
  options: { apiKey?: string; fetchImpl?: typeof fetch } = {}
): Promise<TriageAdvice> {
  if (process.env.SHIP_OPS_JEV === "0") {
    throw new Error("Live Jev calls are disabled by SHIP_OPS_JEV=0; use --dry-run");
  }
  const apiKey = options.apiKey ?? process.env.OPENROUTER_API_KEY;
  if (!apiKey) throw new Error("OPENROUTER_API_KEY is required for live Jev triage");

  const response = await (options.fetchImpl ?? fetch)(JEV_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(buildDecisionRequest(snapshot))
  });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 500);
    throw new Error(`Jev request failed (${response.status}): ${detail || response.statusText}`);
  }

  const body = (await response.json()) as JevResponse;
  if (!body?.answers?.action) throw new Error("Jev response is missing answers.action");
  return mapJevResponse(body);
}
