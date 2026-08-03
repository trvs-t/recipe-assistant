import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  getDemoRecipe,
  getDemoRecipeSummaries,
} from '@/features/recipes/demo-data';
import {
  isRecipeStatus,
  type IImportRequest,
  type IImportSubmission as IContractImportSubmission,
  type IRecipe,
  type IRecipeIngredient,
  type IRecipeStep,
  type IRecipeSummary,
  type RecipeStatus,
} from '@/features/recipes/contracts';

export interface ISupabaseEnv {
  VITE_SUPABASE_URL?: string;
  VITE_SUPABASE_ANON_KEY?: string;
}

interface IRecipeRow {
  id: string;
  title: string | null;
  source_url: string | null;
  description: string | null;
  prep_time_minutes: number | null;
  cook_time_minutes: number | null;
  servings: number | null;
  dietary_tags: string[] | null;
  cuisine_type: string | null;
  status: string | null;
  parse_error: string | null;
  flow_graph: unknown;
  created_at: string;
  updated_at: string;
}

interface IIngredientRow {
  id: string;
  recipe_id: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  sort_order: number;
}

interface IStepRow {
  id: string;
  recipe_id: string;
  instruction: string;
  timer_duration_minutes: number | null;
  sort_order: number;
}

interface IRecipeImportJobRow {
  id: string;
  user_id: string;
  source_url: string;
  idempotency_key: string;
  status: string;
  attempt_count: number;
  max_attempts: number;
  queue_message_id: number | null;
  recipe_id: string | null;
  next_attempt_at: string | null;
  error_code: string | null;
  error_message: string | null;
  error_retryable: boolean | null;
  created_at: string;
  updated_at: string;
}

export interface IRecipeFlowNode {
  id: string;
  stepId: string;
  ingredientIds: string[];
}

export interface IRecipeFlowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: 'sequence' | 'dependency';
}

export interface IRecipeFlow {
  derivation: 'enriched' | 'linear_fallback';
  nodes: IRecipeFlowNode[];
  edges: IRecipeFlowEdge[];
}

type IRecipeWithFlow = IRecipe & { flow: IRecipeFlow };

const importJobStatuses: readonly ImportJobStatus[] = [
  'queued',
  'fetching',
  'extracting',
  'normalizing',
  'validating',
  'persisting',
  'retry_wait',
  'completed',
  'needs_input',
  'failed',
];

let fallbackIdempotencyKeyCounter: number = 0;

export type ImportJobStatus =
  | 'queued'
  | 'fetching'
  | 'extracting'
  | 'normalizing'
  | 'validating'
  | 'persisting'
  | 'retry_wait'
  | 'completed'
  | 'needs_input'
  | 'failed';

export type ImportSubmissionStatus =
  | ImportJobStatus
  | 'pending'
  | 'parsing'
  | 'parsed'
  | 'error';

export type IImportRequestWithIdempotencyKey = IImportRequest & {
  idempotencyKey?: string;
};

export interface IImportSubmission extends Omit<IContractImportSubmission, 'status'> {
  jobId: string;
  status: ImportSubmissionStatus;
  deduplicated: boolean;
  attemptCount: number | null;
  maxAttempts: number | null;
  nextAttemptAt: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  errorRetryable: boolean | null;
}

export interface ILocalDatabase {
  public: {
    Tables: {
      recipes: {
        Row: IRecipeRow;
        Insert: Partial<IRecipeRow>;
        Update: Partial<IRecipeRow>;
        Relationships: [];
      };
      recipe_import_jobs: {
        Row: IRecipeImportJobRow;
        Insert: Partial<IRecipeImportJobRow>;
        Update: Partial<IRecipeImportJobRow>;
        Relationships: [];
      };
      ingredients: {
        Row: IIngredientRow;
        Insert: Partial<IIngredientRow>;
        Update: Partial<IIngredientRow>;
        Relationships: [];
      };
      steps: {
        Row: IStepRow;
        Insert: Partial<IStepRow>;
        Update: Partial<IStepRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
}

export type TypedSupabaseClient = SupabaseClient<ILocalDatabase>;

export type SupabaseMode = 'demo' | 'remote';

export interface ISupabaseAdapter {
  readonly mode: SupabaseMode;
  readonly client: TypedSupabaseClient | null;
  listRecipes(): Promise<IRecipeSummary[]>;
  getRecipe(recipeId: string): Promise<IRecipe | null>;
  submitImport(request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission>;
  getImportSubmission(submissionId: string): Promise<IImportSubmission | null>;
}

export class SupabaseAdapterError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause: unknown = null) {
    super(message);
    this.name = 'SupabaseAdapterError';
    this.cause = cause;
  }
}

function getViteEnv(): ISupabaseEnv {
  return {
    VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL,
    VITE_SUPABASE_ANON_KEY: import.meta.env.VITE_SUPABASE_ANON_KEY,
  };
}

function isConfigured(env: ISupabaseEnv): boolean {
  if (!env.VITE_SUPABASE_URL || !env.VITE_SUPABASE_ANON_KEY) {
    return false;
  }

  try {
    const url: URL = new URL(env.VITE_SUPABASE_URL);
    return (url.protocol === 'https:' || url.protocol === 'http:') && env.VITE_SUPABASE_ANON_KEY.trim().length > 0;
  } catch {
    return false;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function readNonEmptyString(value: unknown): string | null {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

function readString(record: Record<string, unknown>, key: string): string | null {
  return readNonEmptyString(record[key]);
}

function readBoolean(record: Record<string, unknown>, key: string): boolean | null {
  const value: unknown = record[key];
  return typeof value === 'boolean' ? value : null;
}

function readStringArray(value: unknown): string[] | null {
  if (!Array.isArray(value)) {
    return null;
  }

  const result: string[] = [];
  for (const item of value) {
    const stringValue: string | null = readNonEmptyString(item);
    if (stringValue === null) {
      return null;
    }

    result.push(stringValue);
  }

  return result;
}

function compareSortOrder(first: IStepRow, second: IStepRow): number {
  return first.sort_order - second.sort_order;
}

function createLinearRecipeFlow(steps: readonly IStepRow[]): IRecipeFlow {
  const orderedSteps: IStepRow[] = [...steps].sort(compareSortOrder);

  return {
    derivation: 'linear_fallback',
    nodes: orderedSteps.map((step: IStepRow): IRecipeFlowNode => ({
      id: `node:${step.id}`,
      stepId: step.id,
      ingredientIds: [],
    })),
    edges: orderedSteps.slice(1).map((step: IStepRow, index: number): IRecipeFlowEdge => {
      const previousStep: IStepRow | undefined = orderedSteps[index];
      if (previousStep === undefined) {
        throw new Error('Linear flow predecessor is missing');
      }

      return {
        id: `edge:${previousStep.id}:${step.id}`,
        fromNodeId: `node:${previousStep.id}`,
        toNodeId: `node:${step.id}`,
        kind: 'sequence',
      };
    }),
  };
}

function isValidRecipeFlow(
  flow: IRecipeFlow,
  steps: readonly IStepRow[],
  ingredients: readonly IIngredientRow[],
): boolean {
  const stepIds: Set<string> = new Set(steps.map((step: IStepRow): string => step.id));
  const ingredientIds: Set<string> = new Set(
    ingredients.map((ingredient: IIngredientRow): string => ingredient.id),
  );
  const nodeIds: Set<string> = new Set();
  const flowStepIds: Set<string> = new Set();

  if (flow.nodes.length !== stepIds.size) {
    return false;
  }

  for (const node of flow.nodes) {
    if (nodeIds.has(node.id) || flowStepIds.has(node.stepId) || !stepIds.has(node.stepId)) {
      return false;
    }

    nodeIds.add(node.id);
    flowStepIds.add(node.stepId);

    for (const ingredientId of node.ingredientIds) {
      if (!ingredientIds.has(ingredientId)) {
        return false;
      }
    }
  }

  if (flowStepIds.size !== stepIds.size) {
    return false;
  }

  const edgeIds: Set<string> = new Set();
  const adjacency: Map<string, string[]> = new Map(
    [...nodeIds].map((nodeId: string): [string, string[]] => [nodeId, []]),
  );
  const inDegree: Map<string, number> = new Map(
    [...nodeIds].map((nodeId: string): [string, number] => [nodeId, 0]),
  );

  for (const edge of flow.edges) {
    if (
      edgeIds.has(edge.id) ||
      !nodeIds.has(edge.fromNodeId) ||
      !nodeIds.has(edge.toNodeId) ||
      edge.fromNodeId === edge.toNodeId
    ) {
      return false;
    }

    edgeIds.add(edge.id);
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const ready: string[] = [...inDegree.entries()]
    .filter((entry: [string, number]): boolean => entry[1] === 0)
    .map((entry: [string, number]): string => entry[0]);
  let visited: number = 0;

  while (ready.length > 0) {
    const nodeId: string | undefined = ready.pop();
    if (nodeId === undefined) {
      break;
    }

    visited += 1;
    for (const nextNodeId of adjacency.get(nodeId) ?? []) {
      const nextDegree: number = (inDegree.get(nextNodeId) ?? 0) - 1;
      inDegree.set(nextNodeId, nextDegree);
      if (nextDegree === 0) {
        ready.push(nextNodeId);
      }
    }
  }

  return visited === nodeIds.size;
}

function mapRecipeFlow(
  flowGraph: unknown,
  steps: readonly IStepRow[],
  ingredients: readonly IIngredientRow[],
): IRecipeFlow {
  const fallback: IRecipeFlow = createLinearRecipeFlow(steps);
  if (!isRecord(flowGraph)) {
    return fallback;
  }

  const derivation: unknown = flowGraph['derivation'];
  if (derivation !== 'enriched' && derivation !== 'linear_fallback') {
    return fallback;
  }

  const rawNodes: unknown = flowGraph['nodes'];
  const rawEdges: unknown = flowGraph['edges'];
  if (!Array.isArray(rawNodes) || !Array.isArray(rawEdges)) {
    return fallback;
  }

  const nodes: IRecipeFlowNode[] = [];
  for (const rawNode of rawNodes) {
    if (!isRecord(rawNode)) {
      return fallback;
    }

    const id: string | null = readString(rawNode, 'id');
    const stepId: string | null = readString(rawNode, 'stepId');
    const ingredientIds: string[] | null = readStringArray(rawNode['ingredientIds']);
    if (id === null || stepId === null || ingredientIds === null) {
      return fallback;
    }

    nodes.push({ id, stepId, ingredientIds });
  }

  const edges: IRecipeFlowEdge[] = [];
  for (const rawEdge of rawEdges) {
    if (!isRecord(rawEdge)) {
      return fallback;
    }

    const id: string | null = readString(rawEdge, 'id');
    const fromNodeId: string | null = readString(rawEdge, 'fromNodeId');
    const toNodeId: string | null = readString(rawEdge, 'toNodeId');
    const kind: unknown = rawEdge['kind'];
    if (
      id === null ||
      fromNodeId === null ||
      toNodeId === null ||
      (kind !== 'sequence' && kind !== 'dependency')
    ) {
      return fallback;
    }

    edges.push({ id, fromNodeId, toNodeId, kind });
  }

  const flow: IRecipeFlow = { derivation, nodes, edges };
  return isValidRecipeFlow(flow, steps, ingredients) ? flow : fallback;
}

function mapRecipeStatus(value: string | null): RecipeStatus {
  return value !== null && isRecipeStatus(value) ? value : 'pending';
}

function mapRecipeRow(row: IRecipeRow, ingredients: IIngredientRow[], steps: IStepRow[]): IRecipeWithFlow {
  const sortedIngredients: IIngredientRow[] = [...ingredients].sort(
    (first: IIngredientRow, second: IIngredientRow): number => first.sort_order - second.sort_order,
  );
  const sortedSteps: IStepRow[] = [...steps].sort(compareSortOrder);
  const flow: IRecipeFlow = mapRecipeFlow(row.flow_graph, sortedSteps, sortedIngredients);

  return {
    id: row.id,
    title: row.title?.trim() || 'Untitled recipe',
    description: row.description?.trim() || 'A recipe waiting for its story to be filled in.',
    collection: row.cuisine_type?.trim() || 'My recipes',
    tags: row.dietary_tags ?? [],
    sourceUrl: row.source_url,
    servings: row.servings && row.servings > 0 ? row.servings : 2,
    prepMinutes: row.prep_time_minutes,
    cookMinutes: row.cook_time_minutes,
    updatedAt: row.updated_at,
    status: mapRecipeStatus(row.status),
    ingredients: sortedIngredients.map(
      (ingredient: IIngredientRow): IRecipeIngredient => ({
        id: ingredient.id,
        quantity: ingredient.quantity,
        unit: ingredient.unit,
        name: ingredient.name,
        note: ingredient.notes,
      }),
    ),
    steps: sortedSteps.map(
      (step: IStepRow, index: number): IRecipeStep => ({
        id: step.id,
        title: `Step ${index + 1}`,
        description: step.instruction,
        durationMinutes: step.timer_duration_minutes,
      }),
    ),
    flow,
  };
}

function mapRecipeSummary(row: IRecipeRow): IRecipeSummary {
  return {
    id: row.id,
    title: row.title?.trim() || 'Untitled recipe',
    description: row.description?.trim() || 'A recipe waiting for its story to be filled in.',
    collection: row.cuisine_type?.trim() || 'My recipes',
    tags: row.dietary_tags ?? [],
    sourceUrl: row.source_url,
    servings: row.servings && row.servings > 0 ? row.servings : 2,
    prepMinutes: row.prep_time_minutes,
    cookMinutes: row.cook_time_minutes,
    updatedAt: row.updated_at,
    status: mapRecipeStatus(row.status),
  };
}

export function isImportJobStatus(value: string | null): value is ImportJobStatus {
  if (value === null) {
    return false;
  }

  return importJobStatuses.some((status: ImportJobStatus): boolean => status === value);
}

export function isTerminalImportStatus(status: ImportSubmissionStatus): boolean {
  return status === 'completed' || status === 'needs_input' || status === 'failed' || status === 'parsed' || status === 'error';
}

function mapImportJobStatus(value: string | null): ImportJobStatus {
  if (isImportJobStatus(value)) {
    return value;
  }

  throw new SupabaseAdapterError('The import job returned an invalid status.');
}

function getImportStatusMessage(status: ImportSubmissionStatus, errorMessage: string | null): string {
  switch (status) {
    case 'queued':
      return 'Your import is queued and will start shortly.';
    case 'fetching':
      return 'Fetching the source page and checking that it is available.';
    case 'extracting':
      return 'Looking for recipe structure, ingredients, and cooking steps.';
    case 'normalizing':
      return 'Normalizing quantities and turning the source into a clean recipe.';
    case 'validating':
      return 'Checking the recipe structure before it is saved.';
    case 'persisting':
      return 'Saving the imported recipe to your library.';
    case 'retry_wait':
      return errorMessage === null
        ? 'A temporary issue occurred. We will retry the import automatically.'
        : `A temporary issue occurred: ${errorMessage} We will retry automatically.`;
    case 'completed':
      return 'Your structured recipe is ready to cook.';
    case 'needs_input':
      return errorMessage ?? 'The source did not contain enough recipe details. Try another public recipe page.';
    case 'failed':
      return errorMessage ?? 'The import failed. Check the source and try again.';
    case 'pending':
      return 'The source is waiting to be checked.';
    case 'parsing':
      return 'Ingredients and steps are being organized.';
    case 'parsed':
      return 'Your structured recipe is ready to cook.';
    case 'error':
      return errorMessage ?? 'The source could not be imported. Try another URL.';
  }
}

function mapImportJobRow(row: IRecipeImportJobRow): IImportSubmission {
  const status: ImportJobStatus = mapImportJobStatus(row.status);
  return {
    id: row.id,
    jobId: row.id,
    sourceUrl: row.source_url,
    status,
    submittedAt: row.created_at,
    recipeId: row.recipe_id,
    message: getImportStatusMessage(status, row.error_message),
    deduplicated: false,
    attemptCount: row.attempt_count,
    maxAttempts: row.max_attempts,
    nextAttemptAt: row.next_attempt_at,
    errorCode: row.error_code,
    errorMessage: row.error_message,
    errorRetryable: row.error_retryable,
  };
}

function readResponseErrorMessage(record: Record<string, unknown>): string | null {
  const rawError: unknown = record['error'];
  if (typeof rawError === 'string') {
    return readNonEmptyString(rawError);
  }

  if (isRecord(rawError)) {
    return readString(rawError, 'message');
  }

  return null;
}

export function createImportIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return `recipe-import-${globalThis.crypto.randomUUID()}`;
  }

  fallbackIdempotencyKeyCounter += 1;
  return `recipe-import-${Date.now()}-${fallbackIdempotencyKeyCounter}`;
}

function createRemoteAdapter(client: TypedSupabaseClient): ISupabaseAdapter {
  async function getRemoteRecipe(recipeId: string): Promise<IRecipe | null> {
    const recipeResult = await client
      .from('recipes')
      .select('*')
      .eq('id', recipeId)
      .maybeSingle();

    if (recipeResult.error) {
      throw new SupabaseAdapterError('Unable to load this recipe.', recipeResult.error);
    }

    if (recipeResult.data === null) {
      return null;
    }

    const [ingredientsResult, stepsResult] = await Promise.all([
      client.from('ingredients').select('*').eq('recipe_id', recipeId),
      client.from('steps').select('*').eq('recipe_id', recipeId),
    ]);

    if (ingredientsResult.error) {
      throw new SupabaseAdapterError('Unable to load this recipe\'s ingredients.', ingredientsResult.error);
    }

    if (stepsResult.error) {
      throw new SupabaseAdapterError('Unable to load this recipe\'s steps.', stepsResult.error);
    }

    return mapRecipeRow(recipeResult.data, ingredientsResult.data, stepsResult.data);
  }

  return {
    mode: 'remote',
    client,
    async listRecipes(): Promise<IRecipeSummary[]> {
      const result = await client.from('recipes').select('*').order('updated_at', { ascending: false });

      if (result.error) {
        throw new SupabaseAdapterError('Unable to load your recipe library.', result.error);
      }

      return result.data.map(mapRecipeSummary);
    },
    getRecipe: getRemoteRecipe,
    async submitImport(request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission> {
      const sourceUrl: string = request.sourceUrl.trim();
      const idempotencyKey: string = request.idempotencyKey?.trim() || createImportIdempotencyKey();
      const result = await client.functions.invoke<unknown>('import-recipe-v2', {
        body: {
          source_url: sourceUrl,
          idempotency_key: idempotencyKey,
        },
      });

      if (result.error) {
        throw new SupabaseAdapterError('The recipe import could not be submitted.', result.error);
      }

      if (!isRecord(result.data)) {
        throw new SupabaseAdapterError('The recipe import returned an invalid response.');
      }

      const jobId: string | null = readString(result.data, 'job_id');
      if (jobId === null) {
        const errorMessage: string = readResponseErrorMessage(result.data) ?? 'The import did not return a job id.';
        throw new SupabaseAdapterError(errorMessage);
      }

      const rawStatus: string | null = readString(result.data, 'job_status') ?? readString(result.data, 'status');
      const status: ImportJobStatus = mapImportJobStatus(rawStatus);
      const errorMessage: string | null = readResponseErrorMessage(result.data);
      return {
        id: jobId,
        jobId,
        sourceUrl,
        status,
        submittedAt: new Date().toISOString(),
        recipeId: readString(result.data, 'recipe_id'),
        message: getImportStatusMessage(status, errorMessage),
        deduplicated: readBoolean(result.data, 'deduplicated') ?? false,
        attemptCount: null,
        maxAttempts: null,
        nextAttemptAt: null,
        errorCode: null,
        errorMessage,
        errorRetryable: null,
      };
    },
    async getImportSubmission(submissionId: string): Promise<IImportSubmission | null> {
      const result = await client
        .from('recipe_import_jobs')
        .select('*')
        .eq('id', submissionId)
        .maybeSingle();

      if (result.error) {
        throw new SupabaseAdapterError('Unable to load this import job.', result.error);
      }

      if (result.data === null) {
        return null;
      }

      return mapImportJobRow(result.data);
    },
  };
}

function createDemoAdapter(): ISupabaseAdapter {
  const submissions: Map<string, IImportSubmission> = new Map<string, IImportSubmission>();

  return {
    mode: 'demo',
    client: null,
    async listRecipes(): Promise<IRecipeSummary[]> {
      return getDemoRecipeSummaries();
    },
    async getRecipe(recipeId: string): Promise<IRecipe | null> {
      return getDemoRecipe(recipeId);
    },
    async submitImport(request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission> {
      const submissionId: string = `demo-import-${Date.now()}`;
      const submission: IImportSubmission = {
        id: submissionId,
        jobId: submissionId,
        sourceUrl: request.sourceUrl,
        status: 'parsing',
        submittedAt: new Date().toISOString(),
        recipeId: null,
        message: 'Demo mode queued the URL locally. Add Supabase keys to connect the real importer.',
        deduplicated: false,
        attemptCount: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
        errorCode: null,
        errorMessage: null,
        errorRetryable: null,
      };
      submissions.set(submission.id, submission);
      return submission;
    },
    async getImportSubmission(submissionId: string): Promise<IImportSubmission | null> {
      return submissions.get(submissionId) ?? null;
    },
  };
}

export function createSupabaseAdapter(env: ISupabaseEnv = getViteEnv()): ISupabaseAdapter {
  const supabaseUrl: string | undefined = env.VITE_SUPABASE_URL;
  const supabaseAnonKey: string | undefined = env.VITE_SUPABASE_ANON_KEY;

  if (!isConfigured(env) || supabaseUrl === undefined || supabaseAnonKey === undefined) {
    return createDemoAdapter();
  }

  const client: TypedSupabaseClient = createClient<ILocalDatabase>(
    supabaseUrl,
    supabaseAnonKey,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    },
  );

  return createRemoteAdapter(client);
}

export const supabaseAdapter: ISupabaseAdapter = createSupabaseAdapter();
