import { errorMessage } from "./errors.ts";
import {
  type ErrorCode,
  type ErrorDetails,
  type ImportJobState,
  type ImportLogEvent,
  type ImportLogger,
  type ImportStage,
} from "./types.ts";

export const noopLogger: ImportLogger = {
  log(_event: ImportLogEvent): void {
    // Logging is optional for callers that do not need structured output.
  },
};

export function createConsoleLogger(): ImportLogger {
  return {
    log(event: ImportLogEvent): void {
      console.info(JSON.stringify(event));
    },
  };
}

export interface LogEventOptions {
  readonly event: string;
  readonly job: ImportJobState;
  readonly stage: ImportStage;
  readonly attempt: number;
  readonly error_code?: ErrorCode | null;
  readonly retryable?: boolean;
  readonly details?: ErrorDetails;
}

export function emitLog(
  logger: ImportLogger,
  options: LogEventOptions,
): void {
  const event: ImportLogEvent = {
    event: options.event,
    job_id: options.job.id,
    idempotency_key: options.job.idempotency_key,
    stage: options.stage,
    attempt: options.attempt,
    status: options.job.status,
    error_code: options.error_code ?? null,
    retryable: options.retryable ?? false,
    details: options.details ?? {},
  };

  try {
    logger.log(event);
  } catch (error) {
    console.error(JSON.stringify({
      event: "logger_failure",
      message: errorMessage(error),
      source_event: event.event,
      stage: event.stage,
      attempt: event.attempt,
    }));
  }
}
