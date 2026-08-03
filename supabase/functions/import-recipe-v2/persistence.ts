import { PipelineError } from "./errors.ts";
import {
  type ImportJobState,
  type JobStatus,
  type NormalizedRecipe,
  type StructuredError,
} from "./types.ts";

export interface ImportRecord {
  readonly job: ImportJobState;
  readonly recipe: NormalizedRecipe | null;
}

export interface CreateOrGetJobInput {
  readonly source_url: string;
  readonly idempotency_key: string;
  readonly user_id: string | null;
}

export interface CreateOrGetJobResult {
  readonly record: ImportRecord;
  readonly created: boolean;
}

export interface TransitionInput {
  readonly job_id: string;
  readonly expected_status: JobStatus;
  readonly next_status: JobStatus;
  readonly attempt: number;
  readonly last_error: StructuredError | null;
}

export interface TerminalCommitInput {
  readonly job_id: string;
  readonly attempt: number;
  readonly error?: StructuredError;
}

export interface CompletedCommitInput extends TerminalCommitInput {
  readonly recipe: NormalizedRecipe;
}

/**
 * Implementations must make createOrGetJob unique on idempotency_key and make
 * terminal commits atomic with the normalized recipe write.
 */
export interface AtomicPersistenceAdapter {
  createOrGetJob(input: CreateOrGetJobInput): Promise<CreateOrGetJobResult>;
  transition(input: TransitionInput): Promise<ImportJobState>;
  commitCompleted(input: CompletedCommitInput): Promise<ImportRecord>;
  commitNeedsInput(input: TerminalCommitInput): Promise<ImportRecord>;
  commitFailed(input: TerminalCommitInput): Promise<ImportRecord>;
}

export function createUnavailablePersistenceAdapter(): AtomicPersistenceAdapter {
  const unavailable = (): PipelineError =>
    new PipelineError({
      code: "PERSISTENCE_NOT_CONFIGURED",
      message: "No atomic persistence adapter has been configured",
      stage: "persist",
      retryable: false,
    });

  return {
    createOrGetJob(_input: CreateOrGetJobInput): Promise<CreateOrGetJobResult> {
      return Promise.reject(unavailable());
    },
    transition(_input: TransitionInput): Promise<ImportJobState> {
      return Promise.reject(unavailable());
    },
    commitCompleted(_input: CompletedCommitInput): Promise<ImportRecord> {
      return Promise.reject(unavailable());
    },
    commitNeedsInput(_input: TerminalCommitInput): Promise<ImportRecord> {
      return Promise.reject(unavailable());
    },
    commitFailed(_input: TerminalCommitInput): Promise<ImportRecord> {
      return Promise.reject(unavailable());
    },
  };
}
