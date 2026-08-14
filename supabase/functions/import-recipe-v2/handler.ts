import { errorMessage, PipelineError, toStructuredError } from "./errors.ts";
import {
  type ImportWorkerDependencies,
  processClaimedImport,
} from "./worker.ts";
import {
  type ClaimedRecipeImport,
  type RecipeImportGateway,
} from "./supabase-adapter.ts";
import {
  type AiNormalizationAdapter,
  type ImportStage,
  type IngredientNormalizationAdapter,
  type SourceFetcher,
} from "./types.ts";

export const WORKER_ACTION: string = "worker";
const MIN_SOURCE_TEXT_LENGTH: number = 50;
const MAX_SOURCE_TEXT_LENGTH: number = 20_000;

/**
 * Public submission: POST /functions/v1/import-recipe-v2
 * Worker claim: POST /functions/v1/import-recipe-v2?action=worker with the
 * x-import-worker-secret header. The worker route claims one message only.
 */
export const corsHeaders: Readonly<Record<string, string>> = {
  "access-control-allow-origin": "*",
  "access-control-allow-headers":
    "authorization, x-client-info, apikey, content-type, idempotency-key, x-import-worker-secret",
  "access-control-allow-methods": "POST, OPTIONS",
};

export interface ImportHandlerDependencies {
  readonly gateway: RecipeImportGateway;
  readonly source_fetcher: SourceFetcher;
  readonly ai_normalizer: AiNormalizationAdapter;
  readonly ingredient_normalizer?: IngredientNormalizationAdapter;
  readonly worker_secret: string;
  readonly visibility_timeout_seconds?: number;
  readonly retry_delay_seconds?:
    ImportWorkerDependencies["retry_delay_seconds"];
  readonly background_task_runner?: IImportBackgroundTaskRunner;
}

export interface IImportBackgroundTaskRunner {
  schedule(task: () => Promise<void>): void;
}

export function createImportHandler(
  dependencies: ImportHandlerDependencies,
): (request: Request) => Promise<Response> {
  const worker_secret: string = dependencies.worker_secret.trim();
  if (worker_secret.length === 0) {
    throw new Error("IMPORT_WORKER_SECRET is required");
  }

  return async (request: Request): Promise<Response> => {
    if (request.method === "OPTIONS") {
      return new Response("ok", { status: 200, headers: corsHeaders });
    }

    if (request.method !== "POST") {
      return errorResponse(
        new PipelineError({
          code: "INVALID_REQUEST",
          message: "Only POST requests are supported",
          stage: "submit",
          retryable: false,
        }),
        405,
      );
    }

    const action: string | null = readAction(request);
    if (action === WORKER_ACTION) {
      return handleWorker(request, dependencies, worker_secret);
    }
    if (action !== null && action !== "submit") {
      return errorResponse(
        new PipelineError({
          code: "INVALID_REQUEST",
          message: `Unknown import action: ${action}`,
          stage: "submit",
          retryable: false,
        }),
        400,
      );
    }

    return handleSubmission(request, dependencies);
  };
}

async function handleSubmission(
  request: Request,
  dependencies: ImportHandlerDependencies,
): Promise<Response> {
  try {
    const parsed: ImportSubmissionInput = await parseSubmissionRequest(request);
    const access_token: string = accessToken(request);
    const user = await dependencies.gateway.authenticate(access_token);
    const result = await dependencies.gateway.enqueueRecipeImport({
      user_id: user.id,
      source_url: parsed.source_url,
      source_text: parsed.source_text,
      idempotency_key: parsed.idempotency_key,
    });
    scheduleImmediateWorker(result.job_status, dependencies);
    return jsonResponse({
      job_id: result.job_id,
      status: result.job_status,
      job_status: result.job_status,
      recipe_id: result.recipe_id,
      deduplicated: result.deduplicated,
    }, 202);
  } catch (error) {
    return pipelineErrorResponse(error, "submit");
  }
}

async function handleWorker(
  request: Request,
  dependencies: ImportHandlerDependencies,
  worker_secret: string,
): Promise<Response> {
  if (
    !constantTimeEquals(
      request.headers.get("x-import-worker-secret") ?? "",
      worker_secret,
    )
  ) {
    return errorResponse(
      new PipelineError({
        code: "WORKER_UNAUTHORIZED",
        message: "The worker secret is invalid",
        stage: "submit",
        retryable: false,
      }),
      401,
    );
  }

  try {
    await processNextQueuedImport(dependencies);
    return new Response(null, { status: 204, headers: corsHeaders });
  } catch (error) {
    return pipelineErrorResponse(error, "persist");
  }
}

async function processNextQueuedImport(
  dependencies: ImportHandlerDependencies,
): Promise<boolean> {
  const visibility_timeout_seconds: number = positiveIntegerOrDefault(
    dependencies.visibility_timeout_seconds,
    120,
  );
  const claim: ClaimedRecipeImport | null = await dependencies.gateway
    .claimRecipeImport(
      visibility_timeout_seconds,
    );
  if (claim === null) {
    return false;
  }

  await processClaimedImport(claim, {
    gateway: dependencies.gateway,
    source_fetcher: dependencies.source_fetcher,
    ai_normalizer: dependencies.ai_normalizer,
    ingredient_normalizer: dependencies.ingredient_normalizer,
    retry_delay_seconds: dependencies.retry_delay_seconds,
  });
  return true;
}

function scheduleImmediateWorker(
  job_status: string,
  dependencies: ImportHandlerDependencies,
): void {
  const runner: IImportBackgroundTaskRunner | undefined =
    dependencies.background_task_runner;
  if (runner === undefined || job_status !== "queued") {
    return;
  }

  runner.schedule(async (): Promise<void> => {
    try {
      await processNextQueuedImport(dependencies);
    } catch (error) {
      console.error(JSON.stringify({
        event: "import_worker_kick_failed",
        message: errorMessage(error),
      }));
    }
  });
}

interface ImportSubmissionInput {
  readonly source_url: string | null;
  readonly source_text: string | null;
  readonly idempotency_key: string;
}

async function parseSubmissionRequest(
  request: Request,
): Promise<ImportSubmissionInput> {
  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    throw requestError("The request body must be valid JSON");
  }

  if (!isRecord(rawBody)) {
    throw requestError("The request body must be a JSON object");
  }

  const sourceValue: unknown = rawBody["sourceUrl"] ?? rawBody["source_url"] ??
    rawBody["url"];
  const textValue: unknown = rawBody["sourceText"] ?? rawBody["source_text"] ??
    rawBody["text"];
  const idempotencyValue: unknown = rawBody["idempotencyKey"] ??
    rawBody["idempotency_key"] ??
    request.headers.get("idempotency-key");
  if (typeof idempotencyValue !== "string") {
    throw requestError("idempotencyKey is required");
  }

  const source_url: string | null =
    typeof sourceValue === "string" && sourceValue.trim().length > 0
      ? sourceValue.trim()
      : null;
  const source_text: string | null =
    typeof textValue === "string" && textValue.trim().length > 0
      ? textValue.trim()
      : null;
  const idempotency_key: string = idempotencyValue.trim();
  validateSubmissionShape(source_url, source_text, idempotency_key);
  return { source_url, source_text, idempotency_key };
}

function validateSubmissionShape(
  source_url: string | null,
  source_text: string | null,
  idempotency_key: string,
): void {
  const has_url: boolean = source_url !== null;
  const has_text: boolean = source_text !== null;
  if (has_url === has_text) {
    throw new PipelineError({
      code: "INVALID_REQUEST",
      message: "Provide exactly one of sourceUrl or sourceText",
      stage: "submit",
      retryable: false,
    });
  }
  if (source_url !== null) {
    if (source_url.length > 2048) {
      throw requestError("sourceUrl must be under 2048 characters");
    }
    let parsed: URL;
    try {
      parsed = new URL(source_url);
    } catch {
      throw new PipelineError({
        code: "INVALID_URL",
        message: "sourceUrl must be a valid URL",
        stage: "submit",
        retryable: false,
      });
    }
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      throw new PipelineError({
        code: "UNSUPPORTED_PROTOCOL",
        message: "sourceUrl must use http or https",
        stage: "submit",
        retryable: false,
      });
    }
    if (parsed.username.length > 0 || parsed.password.length > 0) {
      throw new PipelineError({
        code: "URL_CREDENTIALS_NOT_ALLOWED",
        message: "sourceUrl must not contain embedded credentials",
        stage: "submit",
        retryable: false,
      });
    }
    if (
      parsed.port.length > 0 && parsed.port !== "80" && parsed.port !== "443"
    ) {
      throw new PipelineError({
        code: "URL_PORT_NOT_ALLOWED",
        message: "sourceUrl uses a port that is not allowed",
        stage: "submit",
        retryable: false,
      });
    }
  }
  if (source_text !== null && source_text.length < MIN_SOURCE_TEXT_LENGTH) {
    throw requestError(
      `sourceText must contain at least ${MIN_SOURCE_TEXT_LENGTH} characters`,
    );
  }
  if (source_text !== null && source_text.length > MAX_SOURCE_TEXT_LENGTH) {
    throw requestError(
      `sourceText must be ${MAX_SOURCE_TEXT_LENGTH} characters or fewer`,
    );
  }
  if (idempotency_key.length === 0 || idempotency_key.length > 200) {
    throw requestError("idempotencyKey must contain 1-200 characters");
  }
}

function accessToken(request: Request): string {
  const header: string | null = request.headers.get("authorization");
  if (header === null) {
    throw new PipelineError({
      code: "UNAUTHORIZED",
      message: "Authorization bearer token is required",
      stage: "submit",
      retryable: false,
    });
  }
  const match: RegExpMatchArray | null = header.match(/^Bearer\s+(\S+)$/i);
  const token: string = match?.[1] ?? "";
  if (token.length === 0) {
    throw new PipelineError({
      code: "UNAUTHORIZED",
      message: "Authorization bearer token is required",
      stage: "submit",
      retryable: false,
    });
  }
  return token;
}

function readAction(request: Request): string | null {
  try {
    return new URL(request.url).searchParams.get("action");
  } catch {
    return null;
  }
}

function requestError(message: string): PipelineError {
  return new PipelineError({
    code: "INVALID_REQUEST",
    message,
    stage: "submit",
    retryable: false,
  });
}

function pipelineErrorResponse(
  error: unknown,
  fallbackStage: ImportStage,
): Response {
  const pipelineError: PipelineError = error instanceof PipelineError
    ? error
    : new PipelineError({
      code: "INTERNAL_ERROR",
      message: error instanceof Error ? error.message : "Request failed",
      stage: fallbackStage,
      retryable: true,
    });
  return errorResponse(pipelineError, statusForError(pipelineError));
}

function errorResponse(error: PipelineError, status: number): Response {
  return jsonResponse({
    error: toStructuredError(error, error.stage, 0),
  }, status);
}

function statusForError(error: PipelineError): number {
  switch (error.code) {
    case "INVALID_REQUEST":
    case "INVALID_URL":
    case "UNSUPPORTED_PROTOCOL":
    case "URL_CREDENTIALS_NOT_ALLOWED":
    case "URL_PORT_NOT_ALLOWED":
      return 400;
    case "UNAUTHORIZED":
    case "WORKER_UNAUTHORIZED":
      return 401;
    case "PERSISTENCE_NOT_CONFIGURED":
    case "PERSISTENCE_FAILED":
      return 503;
    default:
      return 500;
  }
}

function jsonResponse(body: unknown, status: number): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function positiveIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isInteger(value) && value >= 30
    ? value
    : fallback;
}

function constantTimeEquals(left: string, right: string): boolean {
  const leftBytes: Uint8Array = new TextEncoder().encode(left);
  const rightBytes: Uint8Array = new TextEncoder().encode(right);
  let difference: number = leftBytes.length ^ rightBytes.length;
  const length: number = Math.max(leftBytes.length, rightBytes.length);
  for (let index: number = 0; index < length; index += 1) {
    difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
  }
  return difference === 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
