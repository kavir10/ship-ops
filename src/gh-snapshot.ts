import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { validatePrSnapshot, type PrSnapshot } from "./types.js";

const execFileAsync = promisify(execFile);
const MAX_BODY_LENGTH = 1_000;

type GhFile = { path?: unknown; additions?: unknown; deletions?: unknown };
type GhComment = { author?: { login?: unknown }; body?: unknown };
type GhReview = GhComment & { state?: unknown };
type GhCheck = {
  name?: unknown; context?: unknown; status?: unknown; conclusion?: unknown; state?: unknown;
};

export interface GhPrView {
  title?: unknown; body?: unknown; files?: unknown; statusCheckRollup?: unknown;
  reviews?: unknown; comments?: unknown;
}

export type GhRunner = (args: string[]) => Promise<string>;

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function compactBody(value: unknown): string {
  const body = text(value).replace(/\s+/g, " ").trim();
  return body.length > MAX_BODY_LENGTH ? `${body.slice(0, MAX_BODY_LENGTH)}…` : body;
}

export function mapGhPrView(view: GhPrView): PrSnapshot {
  const files = Array.isArray(view.files)
    ? (view.files as GhFile[]).map((file) => ({
        path: text(file.path, "unknown"),
        additions: typeof file.additions === "number" ? file.additions : 0,
        deletions: typeof file.deletions === "number" ? file.deletions : 0
      }))
    : [];
  const ci = Array.isArray(view.statusCheckRollup)
    ? (view.statusCheckRollup as GhCheck[]).map((check) => ({
        name: text(check.name) || text(check.context, "unknown"),
        status: text(check.conclusion) || text(check.state) || text(check.status, "unknown")
      }))
    : [];
  const reviews = Array.isArray(view.reviews)
    ? (view.reviews as GhReview[]).map((review) => ({
        author: text(review.author?.login, "unknown"),
        state: text(review.state, "unknown"),
        body: compactBody(review.body)
      }))
    : [];
  const comments = Array.isArray(view.comments)
    ? (view.comments as GhComment[]).map((comment) => ({
        author: text(comment.author?.login, "unknown"),
        body: compactBody(comment.body)
      }))
    : [];
  return validatePrSnapshot({
    title: text(view.title),
    body: compactBody(view.body),
    files,
    ci,
    review_threads: { reviews, comments }
  });
}

export const runGh: GhRunner = async (args) => {
  try {
    const { stdout } = await execFileAsync("gh", args, { maxBuffer: 10 * 1024 * 1024 });
    return stdout;
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`gh failed to read the pull request: ${detail}`);
  }
};

export async function fetchPrSnapshot(repo: string, pr: number, gh: GhRunner = runGh): Promise<PrSnapshot> {
  const raw = await gh([
    "pr", "view", String(pr), "--repo", repo, "--json",
    "title,body,files,statusCheckRollup,reviews,comments"
  ]);
  try {
    return mapGhPrView(JSON.parse(raw) as GhPrView);
  } catch (error) {
    throw new Error(`gh returned invalid PR JSON: ${(error as Error).message}`);
  }
}
