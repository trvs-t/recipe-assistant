import { PipelineError } from "../errors.ts";
import { assertValidTransition } from "../state-machine.ts";
import {
  type AtomicPersistenceAdapter,
  type CompletedCommitInput,
  type CreateOrGetJobInput,
  type CreateOrGetJobResult,
  type ImportRecord,
  type TerminalCommitInput,
  type TransitionInput,
} from "../persistence.ts";
import {
  type ImportJobState,
  type ImportLogEvent,
  type NormalizedRecipe,
  type SourceDocument,
} from "../types.ts";

export class MemoryPersistence implements AtomicPersistenceAdapter {
  readonly transitions: TransitionInput[] = [];
  private readonly records: Map<string, ImportRecord> = new Map<
    string,
    ImportRecord
  >();
  private sequence: number = 0;

  async createOrGetJob(
    input: CreateOrGetJobInput,
  ): Promise<CreateOrGetJobResult> {
    const existing: ImportRecord | undefined = this.records.get(
      input.idempotency_key,
    );
    if (existing !== undefined) {
      return { record: existing, created: false };
    }

    this.sequence += 1;
    const timestamp: string = new Date(this.sequence * 1000).toISOString();
    const job: ImportJobState = {
      id: `job-${this.sequence}`,
      idempotency_key: input.idempotency_key,
      source_url: input.source_url,
      user_id: input.user_id,
      status: "pending",
      attempt: 0,
      last_error: null,
      created_at: timestamp,
      updated_at: timestamp,
    };
    const record: ImportRecord = { job, recipe: null };
    this.records.set(input.idempotency_key, record);
    return { record, created: true };
  }

  async transition(input: TransitionInput): Promise<ImportJobState> {
    const record: ImportRecord = this.recordById(input.job_id);
    if (record.job.status !== input.expected_status) {
      throw new PipelineError({
        code: "PERSISTENCE_FAILED",
        message: "The in-memory compare-and-set status did not match",
        stage: "persist",
        retryable: true,
      });
    }
    assertValidTransition(input.expected_status, input.next_status);
    const updated: ImportJobState = {
      ...record.job,
      status: input.next_status,
      attempt: input.attempt,
      last_error: input.last_error,
      updated_at: new Date(Date.now()).toISOString(),
    };
    this.records.set(record.job.idempotency_key, {
      job: updated,
      recipe: record.recipe,
    });
    this.transitions.push(input);
    return updated;
  }

  async commitCompleted(input: CompletedCommitInput): Promise<ImportRecord> {
    const record: ImportRecord = this.recordById(input.job_id);
    if (record.job.status === "completed") {
      return record;
    }
    assertValidTransition(record.job.status, "completed");
    return this.commit(
      input.job_id,
      "completed",
      input.attempt,
      null,
      input.recipe,
    );
  }

  async commitNeedsInput(input: TerminalCommitInput): Promise<ImportRecord> {
    const record: ImportRecord = this.recordById(input.job_id);
    if (record.job.status === "needs_input") {
      return record;
    }
    assertValidTransition(record.job.status, "needs_input");
    return this.commit(
      input.job_id,
      "needs_input",
      input.attempt,
      input.error ?? null,
      record.recipe,
    );
  }

  async commitFailed(input: TerminalCommitInput): Promise<ImportRecord> {
    const record: ImportRecord = this.recordById(input.job_id);
    if (record.job.status === "failed") {
      return record;
    }
    assertValidTransition(record.job.status, "failed");
    return this.commit(
      input.job_id,
      "failed",
      input.attempt,
      input.error ?? null,
      record.recipe,
    );
  }

  recordForKey(key: string): ImportRecord {
    const record: ImportRecord | undefined = this.records.get(key);
    if (record === undefined) {
      throw new Error(`Missing record for ${key}`);
    }
    return record;
  }

  private recordById(jobId: string): ImportRecord {
    for (const record of this.records.values()) {
      if (record.job.id === jobId) {
        return record;
      }
    }
    throw new Error(`Missing job ${jobId}`);
  }

  private commit(
    jobId: string,
    status: "completed" | "needs_input" | "failed",
    attempt: number,
    last_error: ImportRecord["job"]["last_error"],
    recipe: NormalizedRecipe | null,
  ): ImportRecord {
    const record: ImportRecord = this.recordById(jobId);
    const updatedJob: ImportJobState = {
      ...record.job,
      status,
      attempt,
      last_error,
      updated_at: new Date(Date.now()).toISOString(),
    };
    const updated: ImportRecord = { job: updatedJob, recipe };
    this.records.set(record.job.idempotency_key, updated);
    return updated;
  }
}

export class RecordingLogger {
  readonly events: ImportLogEvent[] = [];

  log(event: ImportLogEvent): void {
    this.events.push(event);
  }
}

export function sourceDocument(
  source_url: string,
  body: string,
  final_url: string = source_url,
): SourceDocument {
  return {
    source_url,
    final_url,
    status: 200,
    content_type: "text/html; charset=utf-8",
    body,
    redirect_count: final_url === source_url ? 0 : 1,
  };
}
