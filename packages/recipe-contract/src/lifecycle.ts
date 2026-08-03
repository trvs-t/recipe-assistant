import type { ImportJobStatus } from "./schemas";

const TERMINAL_STATUSES: ReadonlySet<ImportJobStatus> = new Set([
  "completed",
  "needs_input",
  "failed",
]);

export function isTerminalImportStatus(status: ImportJobStatus): boolean {
  return TERMINAL_STATUSES.has(status);
}
