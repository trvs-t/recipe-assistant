import {
  type ErrorCode,
  type ErrorDetails,
  type ImportStage,
  type StructuredError,
} from "./types.ts";

export interface PipelineErrorOptions {
  readonly code: ErrorCode;
  readonly message: string;
  readonly stage: ImportStage;
  readonly retryable: boolean;
  readonly details?: ErrorDetails;
}

export class PipelineError extends Error {
  readonly code: ErrorCode;
  readonly stage: ImportStage;
  readonly retryable: boolean;
  readonly details: ErrorDetails;

  constructor(options: PipelineErrorOptions) {
    super(options.message);
    this.name = "PipelineError";
    this.code = options.code;
    this.stage = options.stage;
    this.retryable = options.retryable;
    this.details = options.details ?? {};
  }
}

export interface RetryClassification {
  readonly code: ErrorCode;
  readonly retryable: boolean;
}

export function classifyErrorForRetry(error: unknown): RetryClassification {
  if (error instanceof PipelineError) {
    return {
      code: error.code,
      retryable: error.retryable,
    };
  }

  return {
    code: "INTERNAL_ERROR",
    retryable: true,
  };
}

export function isRetryableFailure(error: unknown): boolean {
  return classifyErrorForRetry(error).retryable;
}

export function toPipelineError(
  error: unknown,
  stage: ImportStage,
): PipelineError {
  if (error instanceof PipelineError) {
    return new PipelineError({
      code: error.code,
      message: error.message,
      stage,
      retryable: error.retryable,
      details: error.details,
    });
  }

  if (error instanceof Error) {
    return new PipelineError({
      code: "INTERNAL_ERROR",
      message: error.message,
      stage,
      retryable: true,
    });
  }

  return new PipelineError({
    code: "INTERNAL_ERROR",
    message: "An unknown pipeline error occurred",
    stage,
    retryable: true,
  });
}

export function toStructuredError(
  error: unknown,
  stage: ImportStage,
  attempt: number,
): StructuredError {
  const pipelineError: PipelineError = toPipelineError(error, stage);
  return {
    code: pipelineError.code,
    message: pipelineError.message,
    stage,
    attempt,
    retryable: pipelineError.retryable,
    details: pipelineError.details,
  };
}

const NEEDS_INPUT_CODES: ReadonlySet<ErrorCode> = new Set<ErrorCode>([
  "INVALID_URL",
  "UNSUPPORTED_PROTOCOL",
  "URL_CREDENTIALS_NOT_ALLOWED",
  "URL_PORT_NOT_ALLOWED",
  "SSRF_BLOCKED",
  "REDIRECT_LIMIT_EXCEEDED",
  "REDIRECT_LOCATION_INVALID",
  "REDIRECT_LOOP",
  "CONTENT_TYPE_UNSUPPORTED",
  "RECIPE_NOT_FOUND",
  "RECIPE_OUTPUT_INVALID",
]);

export function shouldRequestInput(error: unknown): boolean {
  const classification: RetryClassification = classifyErrorForRetry(error);
  return NEEDS_INPUT_CODES.has(classification.code);
}

export function errorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }

  if (typeof error === "string") {
    return error;
  }

  return "Unknown error";
}
