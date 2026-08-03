import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  createImportHandler,
  type IImportBackgroundTaskRunner,
  type ImportHandlerDependencies,
} from "./handler.ts";
import {
  createOpenRouterNormalizerFromEnv,
  type EnvironmentReader,
} from "./openrouter-normalizer.ts";
import { createSourceFetcher } from "./source-fetcher.ts";
import {
  createSupabaseRecipeImportGateway,
  type RecipeImportGateway,
} from "./supabase-adapter.ts";
import { type AiNormalizationAdapter, type SourceFetcher } from "./types.ts";

export * from "./ai-normalizer.ts";
export * from "./canonical-recipe.ts";
export * from "./errors.ts";
export * from "./handler.ts";
export * from "./json-ld-extractor.ts";
export * from "./logger.ts";
export * from "./openrouter-normalizer.ts";
export * from "./persistence.ts";
export * from "./pipeline.ts";
export * from "./source-fetcher.ts";
export * from "./state-machine.ts";
export * from "./supabase-adapter.ts";
export * from "./types.ts";
export * from "./url-policy.ts";
export * from "./worker.ts";

export interface DefaultHandlerOptions {
  readonly env?: EnvironmentReader;
  readonly client?: SupabaseClient;
  readonly gateway?: RecipeImportGateway;
  readonly source_fetcher?: SourceFetcher;
  readonly ai_normalizer?: AiNormalizationAdapter;
  readonly worker_secret?: string;
  readonly visibility_timeout_seconds?: number;
  readonly background_task_runner?: IImportBackgroundTaskRunner;
}

export interface IEdgeRuntimeBackgroundTasks {
  waitUntil(promise: Promise<void>): void;
}

/**
 * Creates the deployable handler. Production requires Supabase service-role
 * credentials, IMPORT_WORKER_SECRET, OPENROUTER_API_KEY, and OPENROUTER_MODEL.
 * OPENROUTER_MODEL is intentionally mandatory: use qwen/qwen3.6-plus for the
 * pinned reliability evaluation, or explicitly choose another model such as
 * openrouter/free for local or cost-constrained trials.
 */
export function createDefaultHandler(
  options: DefaultHandlerOptions = {},
): (request: Request) => Promise<Response> {
  const env: EnvironmentReader = options.env ?? Deno.env;
  const worker_secret: string = options.worker_secret ?? requiredEnvironment(
    env,
    "IMPORT_WORKER_SECRET",
  );
  const gateway: RecipeImportGateway = options.gateway ?? createSupabaseGateway(
    env,
    options.client,
  );
  const ai_normalizer: AiNormalizationAdapter = options.ai_normalizer ??
    createOpenRouterNormalizerFromEnv(env);
  const dependencies: ImportHandlerDependencies = {
    gateway,
    source_fetcher: options.source_fetcher ?? createSourceFetcher(),
    ai_normalizer,
    worker_secret,
    visibility_timeout_seconds: options.visibility_timeout_seconds,
    background_task_runner: options.background_task_runner ??
      createEdgeRuntimeBackgroundTaskRunner(),
  };
  return createImportHandler(dependencies);
}

export function createEdgeRuntimeBackgroundTaskRunner(
  runtime: IEdgeRuntimeBackgroundTasks | undefined = readEdgeRuntime(),
): IImportBackgroundTaskRunner | undefined {
  if (runtime === undefined) {
    return undefined;
  }

  return {
    schedule(task: () => Promise<void>): void {
      runtime.waitUntil(task());
    },
  };
}

function readEdgeRuntime(): IEdgeRuntimeBackgroundTasks | undefined {
  const scope: typeof globalThis & {
    readonly EdgeRuntime?: IEdgeRuntimeBackgroundTasks;
  } = globalThis;
  return scope.EdgeRuntime;
}

function createSupabaseGateway(
  env: EnvironmentReader,
  suppliedClient: SupabaseClient | undefined,
): RecipeImportGateway {
  const client: SupabaseClient = suppliedClient ?? createClient(
    requiredEnvironment(env, "SUPABASE_URL"),
    requiredEnvironment(env, "SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    },
  );
  return createSupabaseRecipeImportGateway(client);
}

function requiredEnvironment(env: EnvironmentReader, name: string): string {
  const value: string | undefined = env.get(name);
  if (value === undefined || value.trim().length === 0) {
    throw new Error(`${name} is required to create the import handler`);
  }
  return value.trim();
}

if (import.meta.main) {
  Deno.serve(createDefaultHandler());
}
