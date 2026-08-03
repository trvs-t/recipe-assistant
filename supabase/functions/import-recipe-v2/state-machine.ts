import { PipelineError } from "./errors.ts";
import { type JobStatus } from "./types.ts";

const ALLOWED_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  pending: ["fetching", "needs_input", "failed"],
  fetching: ["extracting", "pending", "needs_input", "failed"],
  extracting: ["normalizing", "pending", "needs_input", "failed"],
  normalizing: ["persisting", "pending", "needs_input", "failed"],
  persisting: ["completed", "pending", "needs_input", "failed"],
  completed: [],
  needs_input: [],
  failed: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return ALLOWED_TRANSITIONS[from].includes(to);
}

export function assertValidTransition(from: JobStatus, to: JobStatus): void {
  if (canTransition(from, to)) {
    return;
  }

  throw new PipelineError({
    code: "STATE_TRANSITION_INVALID",
    message: `Invalid import state transition: ${from} -> ${to}`,
    stage: "persist",
    retryable: false,
    details: {
      from_status: from,
      to_status: to,
    },
  });
}

export function isTerminalStatus(status: JobStatus): boolean {
  return status === "completed" || status === "needs_input" ||
    status === "failed";
}

export function isActiveStatus(status: JobStatus): boolean {
  return !isTerminalStatus(status);
}
