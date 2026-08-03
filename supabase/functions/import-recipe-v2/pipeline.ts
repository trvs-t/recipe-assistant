import {
  errorMessage,
  isRetryableFailure,
  PipelineError,
  shouldRequestInput,
  toStructuredError,
} from "./errors.ts";
import { extractRecipeFromJsonLd } from "./json-ld-extractor.ts";
import { emitLog, noopLogger } from "./logger.ts";
import {
  type AtomicPersistenceAdapter,
  type CompletedCommitInput,
  type CreateOrGetJobInput,
  type ImportRecord,
  type TerminalCommitInput,
} from "./persistence.ts";
import {
  assertValidTransition,
  isActiveStatus,
  isTerminalStatus,
} from "./state-machine.ts";
import {
  type AiNormalizationAdapter,
  type ImportJobState,
  type ImportLogger,
  type ImportRequest,
  type ImportStage,
  type JobStatus,
  type NormalizedRecipe,
  type SourceDocument,
  type SourceFetcher,
  type StructuredError,
} from "./types.ts";
import { normalizeRecipeDraft } from "./ai-normalizer.ts";

export interface ImportPipelineDependencies {
  readonly source_fetcher: SourceFetcher;
  readonly ai_normalizer: AiNormalizationAdapter;
  readonly persistence: AtomicPersistenceAdapter;
  readonly logger?: ImportLogger;
  readonly sleep?: (milliseconds: number) => Promise<void>;
}

export interface ImportPipelineOptions {
  readonly max_attempts?: number;
  readonly retry_delays_ms?: readonly number[];
}

export interface ImportResult {
  readonly record: ImportRecord;
  readonly reused: boolean;
}

const DEFAULT_MAX_ATTEMPTS: number = 3;
const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [100, 500];

export async function runImport(
  request: ImportRequest,
  dependencies: ImportPipelineDependencies,
  options: ImportPipelineOptions = {},
): Promise<ImportResult> {
  const validatedRequest: ImportRequest = validateImportRequest(request);
  const max_attempts: number = positiveIntegerOrDefault(
    options.max_attempts,
    DEFAULT_MAX_ATTEMPTS,
  );
  const retry_delays_ms: readonly number[] = options.retry_delays_ms ??
    DEFAULT_RETRY_DELAYS_MS;
  const logger: ImportLogger = dependencies.logger ?? noopLogger;
  const sleep: (milliseconds: number) => Promise<void> = dependencies.sleep ??
    delay;

  const createInput: CreateOrGetJobInput = {
    source_url: validatedRequest.source_url,
    idempotency_key: validatedRequest.idempotency_key,
    user_id: validatedRequest.user_id ?? null,
  };
  const created: Awaited<
    ReturnType<AtomicPersistenceAdapter["createOrGetJob"]>
  > = await dependencies.persistence.createOrGetJob(createInput);
  let currentRecord: ImportRecord = created.record;

  if (currentRecord.job.source_url !== validatedRequest.source_url) {
    throw newError(
      "IDEMPOTENCY_CONFLICT",
      "The idempotency key belongs to another source URL",
    );
  }

  if (!created.created && isTerminalStatus(currentRecord.job.status)) {
    return { record: currentRecord, reused: true };
  }

  let currentJob: ImportJobState = currentRecord.job;
  if (isActiveStatus(currentJob.status) && currentJob.status !== "pending") {
    const recoveryAttempt: number = Math.max(1, currentJob.attempt);
    const previousStatus: JobStatus = currentJob.status;
    currentJob = await transitionJob(
      dependencies.persistence,
      currentJob,
      "pending",
      recoveryAttempt,
      currentJob.last_error,
    );
    currentRecord = { job: currentJob, recipe: currentRecord.recipe };
    emitLog(logger, {
      event: "job_recovered_to_pending",
      job: currentJob,
      stage: "persist",
      attempt: recoveryAttempt,
      details: { previous_status: previousStatus },
    });
  }

  const firstAttempt: number = Math.max(1, currentJob.attempt + 1);
  for (
    let attempt: number = firstAttempt;
    attempt <= max_attempts;
    attempt += 1
  ) {
    let stage: ImportStage = "fetch";
    try {
      currentJob = await transitionJob(
        dependencies.persistence,
        currentJob,
        "fetching",
        attempt,
        null,
      );
      emitLog(logger, {
        event: "stage_started",
        job: currentJob,
        stage,
        attempt,
        details: { source_url: validatedRequest.source_url },
      });

      const source: SourceDocument = await dependencies.source_fetcher.fetch(
        validatedRequest.source_url,
        attempt,
      );

      stage = "extract";
      currentJob = await transitionJob(
        dependencies.persistence,
        currentJob,
        "extracting",
        attempt,
        null,
      );
      emitLog(logger, {
        event: "stage_started",
        job: currentJob,
        stage,
        attempt,
        details: { strategy: "json_ld_first" },
      });

      const deterministicRecipe: NormalizedRecipe | null =
        extractRecipeFromJsonLd(
          source.body,
          validatedRequest.source_url,
        );

      stage = "normalize";
      currentJob = await transitionJob(
        dependencies.persistence,
        currentJob,
        "normalizing",
        attempt,
        null,
      );

      let recipe: NormalizedRecipe;
      if (deterministicRecipe !== null) {
        recipe = deterministicRecipe;
        emitLog(logger, {
          event: "normalization_selected",
          job: currentJob,
          stage,
          attempt,
          details: { strategy: "json_ld" },
        });
      } else {
        emitLog(logger, {
          event: "normalization_selected",
          job: currentJob,
          stage,
          attempt,
          details: { strategy: "ai_adapter_fallback" },
        });
        const draft = await dependencies.ai_normalizer.normalize({
          source_url: validatedRequest.source_url,
          resolved_url: source.final_url,
          content: source.body,
          attempt,
        });
        recipe = normalizeRecipeDraft(draft, validatedRequest.source_url);
      }

      stage = "persist";
      currentJob = await transitionJob(
        dependencies.persistence,
        currentJob,
        "persisting",
        attempt,
        null,
      );
      emitLog(logger, {
        event: "stage_started",
        job: currentJob,
        stage,
        attempt,
        details: { operation: "atomic_recipe_commit" },
      });

      const completedInput: CompletedCommitInput = {
        job_id: currentJob.id,
        attempt,
        recipe,
      };
      currentRecord = await dependencies.persistence.commitCompleted(
        completedInput,
      );
      emitLog(logger, {
        event: "job_terminal",
        job: currentRecord.job,
        stage,
        attempt,
        details: { terminal_status: "completed" },
      });
      return { record: currentRecord, reused: false };
    } catch (error) {
      const structured: StructuredError = toStructuredError(
        error,
        stage,
        attempt,
      );
      emitLog(logger, {
        event: "stage_failed",
        job: currentJob,
        stage,
        attempt,
        error_code: structured.code,
        retryable: structured.retryable,
        details: structured.details,
      });

      if (isRetryableFailure(error) && attempt < max_attempts) {
        try {
          currentJob = await transitionJob(
            dependencies.persistence,
            currentJob,
            "pending",
            attempt,
            structured,
          );
          emitLog(logger, {
            event: "retry_scheduled",
            job: currentJob,
            stage,
            attempt,
            error_code: structured.code,
            retryable: true,
            details: {
              next_attempt: attempt + 1,
              delay_ms: retryDelay(attempt, retry_delays_ms),
            },
          });
          await sleep(retryDelay(attempt, retry_delays_ms));
          continue;
        } catch (recoveryError) {
          const recoveryStructured: StructuredError = toStructuredError(
            recoveryError,
            "persist",
            attempt,
          );
          const failedRecord: ImportRecord = await finalizeFailed(
            dependencies.persistence,
            currentJob,
            recoveryStructured,
            attempt,
          );
          return { record: failedRecord, reused: false };
        }
      }

      const terminalRecord: ImportRecord = shouldRequestInput(error)
        ? await finalizeNeedsInput(
          dependencies.persistence,
          currentJob,
          structured,
          attempt,
        )
        : await finalizeFailed(
          dependencies.persistence,
          currentJob,
          structured,
          attempt,
        );
      emitLog(logger, {
        event: "job_terminal",
        job: terminalRecord.job,
        stage,
        attempt,
        error_code: structured.code,
        retryable: structured.retryable,
        details: { terminal_status: terminalRecord.job.status },
      });
      return { record: terminalRecord, reused: false };
    }
  }

  const exhausted: StructuredError = {
    code: "INTERNAL_ERROR",
    message: "The import attempt loop exited without a terminal result",
    stage: "persist",
    attempt: max_attempts,
    retryable: false,
    details: {},
  };
  const terminalRecord: ImportRecord = await finalizeFailed(
    dependencies.persistence,
    currentJob,
    exhausted,
    max_attempts,
  );
  return { record: terminalRecord, reused: false };
}

export function validateImportRequest(request: ImportRequest): ImportRequest {
  if (typeof request !== "object" || request === null) {
    throw newError("INVALID_REQUEST", "An import request object is required");
  }

  const source_url: string = typeof request.source_url === "string"
    ? request.source_url.trim()
    : "";
  const idempotency_key: string = typeof request.idempotency_key === "string"
    ? request.idempotency_key.trim()
    : "";

  if (source_url.length === 0 || source_url.length > 2048) {
    throw newError(
      "INVALID_REQUEST",
      "source_url must be a non-empty URL under 2048 characters",
    );
  }
  if (idempotency_key.length === 0 || idempotency_key.length > 256) {
    throw newError(
      "INVALID_REQUEST",
      "idempotency_key must be 1-256 characters",
    );
  }

  return {
    source_url,
    idempotency_key,
    user_id: request.user_id ?? null,
  };
}

function transitionJob(
  persistence: AtomicPersistenceAdapter,
  job: ImportJobState,
  next_status: JobStatus,
  attempt: number,
  last_error: StructuredError | null,
): Promise<ImportJobState> {
  assertValidTransition(job.status, next_status);
  return persistence.transition({
    job_id: job.id,
    expected_status: job.status,
    next_status,
    attempt,
    last_error,
  });
}

async function finalizeNeedsInput(
  persistence: AtomicPersistenceAdapter,
  job: ImportJobState,
  error: StructuredError,
  attempt: number,
): Promise<ImportRecord> {
  const input: TerminalCommitInput = {
    job_id: job.id,
    attempt,
    error,
  };
  try {
    return await persistence.commitNeedsInput(input);
  } catch (terminalError) {
    return finalizeFailed(
      persistence,
      job,
      toStructuredError(terminalError, "persist", attempt),
      attempt,
    );
  }
}

async function finalizeFailed(
  persistence: AtomicPersistenceAdapter,
  job: ImportJobState,
  error: StructuredError,
  attempt: number,
): Promise<ImportRecord> {
  const input: TerminalCommitInput = {
    job_id: job.id,
    attempt,
    error,
  };
  try {
    return await persistence.commitFailed(input);
  } catch (terminalError) {
    const normalized: PipelineError = toPipelineErrorForPersistence(
      terminalError,
      attempt,
    );
    throw normalized;
  }
}

function toPipelineErrorForPersistence(error: unknown, attempt: number) {
  return new PipelineError({
    code: "PERSISTENCE_FAILED",
    message: `Unable to persist terminal import status at attempt ${attempt}: ${
      errorMessage(error)
    }`,
    stage: "persist",
    retryable: false,
  });
}

function newError(
  code: "INVALID_REQUEST" | "IDEMPOTENCY_CONFLICT",
  message: string,
): PipelineError {
  return new PipelineError({
    code,
    message,
    stage: "fetch",
    retryable: false,
  });
}

function positiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isInteger(value) && value > 0
    ? value
    : fallback;
}

function retryDelay(attempt: number, delays: readonly number[]): number {
  const configured: number | undefined = delays[attempt - 1];
  return configured !== undefined && Number.isFinite(configured) &&
      configured >= 0
    ? configured
    : 0;
}

async function delay(milliseconds: number): Promise<void> {
  await new Promise<void>((resolve): void => {
    setTimeout(resolve, milliseconds);
  });
}
