import { type SupabaseClient } from "@supabase/supabase-js";

import { PipelineError } from "./errors.ts";
import { type CanonicalRecipePayload } from "./canonical-recipe.ts";
import { type ErrorCode } from "./types.ts";

export interface AuthenticatedImportUser {
  readonly id: string;
}

export interface EnqueueRecipeImportInput {
  readonly user_id: string;
  readonly source_url: string | null;
  readonly source_text?: string | null;
  readonly idempotency_key: string;
}

export interface EnqueueRecipeImportResult {
  readonly job_id: string;
  readonly job_status: string;
  readonly recipe_id: string | null;
  readonly deduplicated: boolean;
}

export interface ClaimedRecipeImport {
  readonly message_id: number;
  readonly job_id: string;
  readonly source_url: string | null;
  readonly source_text?: string | null;
  readonly attempt_number: number;
  readonly max_attempts: number;
}

export type RecipeImportWorkerStage =
  | "fetch"
  | "extract"
  | "normalize"
  | "validate"
  | "persist";

export interface RecipeImportGateway {
  authenticate(access_token: string): Promise<AuthenticatedImportUser>;
  enqueueRecipeImport(
    input: EnqueueRecipeImportInput,
  ): Promise<EnqueueRecipeImportResult>;
  claimRecipeImport(
    visibility_timeout_seconds: number,
  ): Promise<ClaimedRecipeImport | null>;
  markStage(
    claim: ClaimedRecipeImport,
    stage: RecipeImportWorkerStage,
    fetch_count?: number,
  ): Promise<void>;
  persistRecipeImport(
    claim: ClaimedRecipeImport,
    recipe: CanonicalRecipePayload,
  ): Promise<string>;
  finishRecipeImportError(
    claim: ClaimedRecipeImport,
    code: ErrorCode,
    message: string,
    retryable: boolean,
    retry_delay_seconds: number,
  ): Promise<string>;
}

export interface SupabaseCallResult {
  readonly data: unknown;
  readonly error: unknown;
}

export interface SupabaseImportTransport {
  getUser(access_token: string): Promise<SupabaseCallResult>;
  rpc(
    function_name: string,
    args: Readonly<Record<string, unknown>>,
  ): Promise<SupabaseCallResult>;
  markStage(
    claim: ClaimedRecipeImport,
    stage: RecipeImportWorkerStage,
    fetch_count?: number,
  ): Promise<SupabaseCallResult>;
}

export class SupabaseRecipeImportGateway implements RecipeImportGateway {
  private readonly transport: SupabaseImportTransport;

  constructor(transport: SupabaseImportTransport) {
    this.transport = transport;
  }

  async authenticate(access_token: string): Promise<AuthenticatedImportUser> {
    const result: SupabaseCallResult = await this.transport.getUser(
      access_token,
    );
    if (result.error !== null && result.error !== undefined) {
      throw unauthorized("The access token could not be verified");
    }
    if (!isRecord(result.data)) {
      throw unauthorized("The access token could not be verified");
    }
    const user: unknown = isRecord(result.data)
      ? result.data["user"]
      : undefined;
    const id: string | null = isRecord(user)
      ? nonEmptyString(user["id"])
      : null;
    if (id === null) {
      throw unauthorized("The access token does not identify a user");
    }
    return { id };
  }

  async enqueueRecipeImport(
    input: EnqueueRecipeImportInput,
  ): Promise<EnqueueRecipeImportResult> {
    const textImportResult: SupabaseCallResult = await this.transport.rpc(
      "enqueue_recipe_import_with_text",
      {
        p_user_id: input.user_id,
        p_source_url: input.source_url,
        p_source_text: input.source_text ?? null,
        p_idempotency_key: input.idempotency_key,
      },
    );
    const isUrlOnlyImport: boolean = input.source_text === undefined ||
      input.source_text === null;
    const result: SupabaseCallResult = isUrlOnlyImport &&
        isMissingTextImportFunctionError(textImportResult.error)
      ? await this.transport.rpc(
        "enqueue_recipe_import",
        {
          p_user_id: input.user_id,
          p_source_url: input.source_url,
          p_idempotency_key: input.idempotency_key,
        },
      )
      : textImportResult;
    throwOnSupabaseError(result, "Unable to enqueue the recipe import");
    const row: Record<string, unknown> = firstRow(result.data);
    const job_id: string = requiredString(row, "job_id");
    const job_status: string = requiredString(row, "job_status");
    const recipe_id: string | null = nullableString(row["recipe_id"]);
    const deduplicated: boolean = requiredBoolean(row, "deduplicated");
    return { job_id, job_status, recipe_id, deduplicated };
  }

  async claimRecipeImport(
    visibility_timeout_seconds: number,
  ): Promise<ClaimedRecipeImport | null> {
    const result: SupabaseCallResult = await this.transport.rpc(
      "claim_recipe_import",
      { p_visibility_timeout_seconds: visibility_timeout_seconds },
    );
    throwOnSupabaseError(result, "Unable to claim a recipe import");
    if (result.data === null || result.data === undefined) {
      return null;
    }
    const rows: unknown[] = Array.isArray(result.data)
      ? result.data
      : [result.data];
    const first: unknown = rows[0];
    if (first === undefined) {
      return null;
    }
    if (!isRecord(first)) {
      throw persistenceError("The claim RPC returned an invalid message");
    }

    return {
      message_id: requiredInteger(first, "message_id", 0),
      job_id: requiredString(first, "job_id"),
      source_url: nullableString(first["source_url"]),
      source_text: nullableString(first["source_text"]),
      attempt_number: requiredInteger(first, "attempt_number", 1),
      max_attempts: requiredInteger(first, "max_attempts", 1),
    };
  }

  async markStage(
    claim: ClaimedRecipeImport,
    stage: RecipeImportWorkerStage,
    fetch_count?: number,
  ): Promise<void> {
    const result: SupabaseCallResult = await this.transport.markStage(
      claim,
      stage,
      fetch_count,
    );
    throwOnSupabaseError(result, "Unable to update the recipe import stage");
  }

  async persistRecipeImport(
    claim: ClaimedRecipeImport,
    recipe: CanonicalRecipePayload,
  ): Promise<string> {
    const result: SupabaseCallResult = await this.transport.rpc(
      "persist_recipe_import",
      {
        p_job_id: claim.job_id,
        p_attempt_number: claim.attempt_number,
        p_recipe: recipe,
      },
    );
    throwOnSupabaseError(result, "Unable to persist the imported recipe");
    const recipe_id: string | null = scalarString(result.data);
    if (recipe_id === null) {
      throw persistenceError("The persistence RPC returned no recipe id");
    }
    return recipe_id;
  }

  async finishRecipeImportError(
    claim: ClaimedRecipeImport,
    code: ErrorCode,
    message: string,
    retryable: boolean,
    retry_delay_seconds: number,
  ): Promise<string> {
    const result: SupabaseCallResult = await this.transport.rpc(
      "finish_recipe_import_error",
      {
        p_job_id: claim.job_id,
        p_attempt_number: claim.attempt_number,
        p_error_code: code,
        p_error_message: message,
        p_retryable: retryable,
        p_retry_delay_seconds: retry_delay_seconds,
      },
    );
    throwOnSupabaseError(result, "Unable to finalize the recipe import error");
    const status: string | null = scalarString(result.data);
    if (status === null) {
      throw persistenceError("The error finalization RPC returned no status");
    }
    return status;
  }
}

export function createSupabaseRecipeImportGateway(
  client: SupabaseClient,
): RecipeImportGateway {
  const transport: SupabaseImportTransport = {
    async getUser(access_token: string): Promise<SupabaseCallResult> {
      const result = await client.auth.getUser(access_token);
      return {
        data: result.data,
        error: result.error,
      };
    },
    async rpc(
      function_name: string,
      args: Readonly<Record<string, unknown>>,
    ): Promise<SupabaseCallResult> {
      const result = await client.rpc(function_name, args);
      return {
        data: result.data,
        error: result.error,
      };
    },
    async markStage(
      claim: ClaimedRecipeImport,
      stage: RecipeImportWorkerStage,
      fetch_count?: number,
    ): Promise<SupabaseCallResult> {
      const jobResult = await client
        .from("recipe_import_jobs")
        .update({ status: jobStatusForStage(stage) })
        .eq("id", claim.job_id)
        .eq("queue_message_id", claim.message_id)
        .eq("attempt_count", claim.attempt_number)
        .select("id")
        .maybeSingle();
      if (jobResult.error !== null || jobResult.data === null) {
        return {
          data: jobResult.data,
          error: jobResult.error ??
            { message: "Import attempt lease is stale" },
        };
      }

      const attemptUpdate: Record<string, string | number> = { stage };
      if (fetch_count !== undefined) {
        attemptUpdate["fetch_count"] = fetch_count;
      }
      const attemptResult = await client
        .from("recipe_import_attempts")
        .update(attemptUpdate)
        .eq("job_id", claim.job_id)
        .eq("attempt_number", claim.attempt_number);
      if (attemptResult.error !== null) {
        return { data: attemptResult.data, error: attemptResult.error };
      }
      return {
        data: jobResult.data,
        error: jobResult.error,
      };
    },
  };
  return new SupabaseRecipeImportGateway(transport);
}

function jobStatusForStage(stage: RecipeImportWorkerStage): string {
  switch (stage) {
    case "fetch":
      return "fetching";
    case "extract":
      return "extracting";
    case "normalize":
      return "normalizing";
    case "validate":
      return "validating";
    case "persist":
      return "persisting";
  }
}

function throwOnSupabaseError(
  result: SupabaseCallResult,
  message: string,
): void {
  if (result.error === null || result.error === undefined) {
    return;
  }
  const detail: string = errorText(result.error);
  throw new PipelineError({
    code: "PERSISTENCE_FAILED",
    message: `${message}: ${detail}`,
    stage: "persist",
    retryable: true,
  });
}

function firstRow(value: unknown): Record<string, unknown> {
  const first: unknown = Array.isArray(value) ? value[0] : value;
  if (!isRecord(first)) {
    throw persistenceError("The enqueue RPC returned no job");
  }
  return first;
}

function requiredString(record: Record<string, unknown>, key: string): string {
  const value: string | null = nonEmptyString(record[key]);
  if (value === null) {
    throw persistenceError(`The RPC returned an invalid ${key}`);
  }
  return value;
}

function requiredBoolean(
  record: Record<string, unknown>,
  key: string,
): boolean {
  const value: unknown = record[key];
  if (typeof value !== "boolean") {
    throw persistenceError(`The RPC returned an invalid ${key}`);
  }
  return value;
}

function requiredInteger(
  record: Record<string, unknown>,
  key: string,
  minimum: number,
): number {
  const value: unknown = record[key];
  const numberValue: number = typeof value === "number"
    ? value
    : typeof value === "string"
    ? Number(value)
    : Number.NaN;
  if (!Number.isInteger(numberValue) || numberValue < minimum) {
    throw persistenceError(`The RPC returned an invalid ${key}`);
  }
  return numberValue;
}

function nullableString(value: unknown): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  return nonEmptyString(value);
}

function scalarString(value: unknown): string | null {
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  return null;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed: string = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function errorText(value: unknown): string {
  if (isRecord(value) && typeof value["message"] === "string") {
    return value["message"];
  }
  if (value instanceof Error) {
    return value.message;
  }
  return "Supabase request failed";
}

export function isMissingTextImportFunctionError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code: unknown = error["code"];
  const searchableText: string = [
    error["message"],
    error["details"],
    error["hint"],
  ]
    .filter((value: unknown): value is string => typeof value === "string")
    .join(" ")
    .toLowerCase();
  const referencesTextImportFunction: boolean = searchableText.includes(
    "enqueue_recipe_import_with_text",
  );
  return referencesTextImportFunction && (
    code === "42883" ||
    code === "PGRST202" ||
    searchableText.includes("does not exist") ||
    searchableText.includes("schema cache") ||
    searchableText.includes("could not find")
  );
}

function unauthorized(message: string): PipelineError {
  return new PipelineError({
    code: "UNAUTHORIZED",
    message,
    stage: "submit",
    retryable: false,
  });
}

function persistenceError(message: string): PipelineError {
  return new PipelineError({
    code: "PERSISTENCE_FAILED",
    message,
    stage: "persist",
    retryable: true,
  });
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
