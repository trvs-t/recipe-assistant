import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import {
  getDemoRecipe,
  getDemoFolders,
  getDemoRecipes,
} from '@/features/recipes/demo-data';
import { buildDeterministicIngredientFlow } from '@/features/recipes/ingredient-linking';
import { normalizeFolderName, validateFolderName } from '@/features/recipes/folders';
import {
  isRecipeStatus,
  type IFolder,
  type IImportRequest,
  type IImportSubmission as IContractImportSubmission,
  type IIngredientEditInput,
  type IIngredientMeasurement,
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

interface IRecipeRow extends Record<string, unknown> {
  id: string;
  title: string | null;
  source_url: string | null;
  source_text: string | null;
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

interface IIngredientRow extends Record<string, unknown> {
  id: string;
  recipe_id: string;
  original_text: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
  sort_order: number;
  variation_of_id: string | null;
}

interface IIngredientMeasurementRow extends Record<string, unknown> {
  id: string;
  ingredient_id: string;
  quantity_min: number;
  quantity_max: number;
  unit: string | null;
  is_primary: boolean;
  sort_order: number;
}

interface IStepRow extends Record<string, unknown> {
  id: string;
  recipe_id: string;
  instruction: string;
  timer_duration_minutes: number | null;
  sort_order: number;
}

interface IRecipeImportJobRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  source_url: string | null;
  source_text: string | null;
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

interface IFolderRow extends Record<string, unknown> {
  id: string;
  user_id: string;
  name: string;
  created_at: string;
  updated_at: string;
}

interface IRecipeFolderRow extends Record<string, unknown> {
  recipe_id: string;
  folder_id: string;
  created_at: string;
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
let demoImportSubmissionCounter: number = 0;
const DEMO_IMPORT_STORAGE_KEY: string = 'recipe-collector.demo-imports.v1';

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
        Insert: Record<string, unknown> & Partial<IIngredientRow>;
        Update: Record<string, unknown> & Partial<IIngredientRow>;
        Relationships: [];
      };
      ingredient_measurements: {
        Row: IIngredientMeasurementRow;
        Insert: Partial<IIngredientMeasurementRow>;
        Update: Partial<IIngredientMeasurementRow>;
        Relationships: [];
      };
      steps: {
        Row: IStepRow;
        Insert: Partial<IStepRow>;
        Update: Partial<IStepRow>;
        Relationships: [];
      };
      folders: {
        Row: IFolderRow;
        Insert: Partial<IFolderRow>;
        Update: Partial<IFolderRow>;
        Relationships: [];
      };
      recipe_folders: {
        Row: IRecipeFolderRow;
        Insert: Partial<IRecipeFolderRow>;
        Update: Partial<IRecipeFolderRow>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      set_recipe_folders: {
        Args: {
          p_recipe_id: string;
          p_folder_ids: string[];
        };
        Returns: null;
      };
    };
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
  listFolders(): Promise<IFolder[]>;
  createFolder(name: string): Promise<IFolder>;
  renameFolder(folderId: string, name: string): Promise<void>;
  deleteFolder(folderId: string): Promise<void>;
  setRecipeFolders(recipeId: string, folderIds: string[]): Promise<void>;
  listImportSubmissions(): Promise<IImportSubmission[]>;
  getRecipe(recipeId: string): Promise<IRecipe | null>;
  updateIngredient(recipeId: string, ingredientId: string, input: IIngredientEditInput): Promise<void>;
  addIngredientVariation(recipeId: string, input: IIngredientVariationInput): Promise<string>;
  autoLinkRecipe(recipeId: string): Promise<void>;
  submitImport(request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission>;
  getImportSubmission(submissionId: string): Promise<IImportSubmission | null>;
}

export interface IIngredientVariationInput extends IIngredientEditInput {
  variationOfId: string;
}

export class SupabaseAdapterError extends Error {
  public readonly cause: unknown;

  public constructor(message: string, cause: unknown = null) {
    super(message);
    this.name = 'SupabaseAdapterError';
    this.cause = cause;
  }
}

/**
 * The web client can be deployed before a Supabase migration reaches the
 * project. Folder reads should not make the existing recipe library unusable
 * during that short rollout window.
 */
export function isMissingFolderSchemaError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }

  const code: unknown = error['code'];
  const searchableText: string = [error['message'], error['details'], error['hint']]
    .filter((value: unknown): value is string => typeof value === 'string')
    .join(' ')
    .toLowerCase();
  const referencesFolderFeature: boolean = searchableText.includes('folder') ||
    searchableText.includes('recipe_folders');
  return referencesFolderFeature && (
    code === '42P01' ||
    code === 'PGRST202' ||
    code === 'PGRST205' ||
    searchableText.includes('does not exist') ||
    searchableText.includes('schema cache') ||
    searchableText.includes('could not find')
  );
}

function isMissingIngredientMeasurementsError(error: unknown): boolean {
  if (!isRecord(error)) {
    return false;
  }
  const code: unknown = error['code'];
  const message: unknown = error['message'];
  return code === '42P01' ||
    (typeof message === 'string' && message.includes('ingredient_measurements'));
}

function folderSchemaUnavailableError(cause: unknown): SupabaseAdapterError {
  return new SupabaseAdapterError(
    'Recipe folders are not available until the latest database migration is applied.',
    cause,
  );
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

function mapRecipeRow(
  row: IRecipeRow,
  ingredients: IIngredientRow[],
  steps: IStepRow[],
  measurements: IIngredientMeasurementRow[] = [],
  folderIds: string[] = [],
): IRecipeWithFlow {
  const sortedIngredients: IIngredientRow[] = [...ingredients].sort(
    (first: IIngredientRow, second: IIngredientRow): number => first.sort_order - second.sort_order,
  );
  const sortedSteps: IStepRow[] = [...steps].sort(compareSortOrder);
  const flow: IRecipeFlow = mapRecipeFlow(row.flow_graph, sortedSteps, sortedIngredients);
  const measurementsByIngredientId: Map<string, IIngredientMeasurement[]> =
    mapIngredientMeasurements(measurements);

  return {
    id: row.id,
    title: row.title?.trim() || 'Untitled recipe',
    description: row.description?.trim() || 'A recipe waiting for its story to be filled in.',
    collection: row.cuisine_type?.trim() || 'My recipes',
    folderIds: [...folderIds],
    tags: row.dietary_tags ?? [],
    sourceUrl: row.source_url,
    sourceText: row.source_text,
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
        measurements: measurementsByIngredientId.get(ingredient.id) ?? [],
        variationOfId: ingredient.variation_of_id,
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

function mapIngredientMeasurements(
  rows: readonly IIngredientMeasurementRow[],
): Map<string, IIngredientMeasurement[]> {
  const byIngredientId: Map<string, IIngredientMeasurement[]> = new Map();
  for (const row of [...rows].sort(
    (first: IIngredientMeasurementRow, second: IIngredientMeasurementRow): number =>
      first.sort_order - second.sort_order,
  )) {
    const existing: IIngredientMeasurement[] = byIngredientId.get(row.ingredient_id) ?? [];
    existing.push({
      id: row.id,
      quantityMin: row.quantity_min,
      quantityMax: row.quantity_max,
      unit: row.unit,
      isPrimary: row.is_primary,
      sortOrder: row.sort_order,
    });
    byIngredientId.set(row.ingredient_id, existing);
  }
  return byIngredientId;
}

function mapRecipeSummary(row: IRecipeRow, folderIds: string[] = []): IRecipeSummary {
  return {
    id: row.id,
    title: row.title?.trim() || 'Untitled recipe',
    description: row.description?.trim() || 'A recipe waiting for its story to be filled in.',
    collection: row.cuisine_type?.trim() || 'My recipes',
    folderIds: [...folderIds],
    tags: row.dietary_tags ?? [],
    sourceUrl: row.source_url,
    servings: row.servings && row.servings > 0 ? row.servings : 2,
    prepMinutes: row.prep_time_minutes,
    cookMinutes: row.cook_time_minutes,
    updatedAt: row.updated_at,
    status: mapRecipeStatus(row.status),
  };
}

function mapFolderRow(row: IFolderRow): IFolder {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function mapFolderLinks(rows: readonly IRecipeFolderRow[]): Map<string, string[]> {
  const folderIdsByRecipeId: Map<string, string[]> = new Map<string, string[]>();
  for (const row of rows) {
    const folderIds: string[] = folderIdsByRecipeId.get(row.recipe_id) ?? [];
    folderIds.push(row.folder_id);
    folderIdsByRecipeId.set(row.recipe_id, folderIds);
  }
  return folderIdsByRecipeId;
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
    sourceText: row.source_text,
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

function isImportSubmissionStatusValue(value: string): value is ImportSubmissionStatus {
  return (
    value === 'pending' ||
    value === 'parsing' ||
    value === 'parsed' ||
    value === 'error' ||
    isImportJobStatus(value)
  );
}

function readNullableNumber(record: Record<string, unknown>, key: string): number | null {
  const value: unknown = record[key];
  return value === null || value === undefined
    ? null
    : typeof value === 'number' && Number.isFinite(value)
      ? value
      : null;
}

function readDemoSubmission(value: unknown): IImportSubmission | null {
  if (!isRecord(value)) {
    return null;
  }

  const id: string | null = readString(value, 'id');
  const jobId: string | null = readString(value, 'jobId');
  const sourceUrl: string | null = readString(value, 'sourceUrl');
  const sourceText: string | null = readString(value, 'sourceText');
  const submittedAt: string | null = readString(value, 'submittedAt');
  const rawStatus: string | null = readString(value, 'status');
  const message: string | null = readString(value, 'message');
  const deduplicated: boolean | null = readBoolean(value, 'deduplicated');

  if (
    id === null ||
    jobId === null ||
    (sourceUrl === null && sourceText === null) ||
    submittedAt === null ||
    rawStatus === null ||
    !isImportSubmissionStatusValue(rawStatus) ||
    message === null ||
    deduplicated === null
  ) {
    return null;
  }

  return {
    id,
    jobId,
    sourceUrl,
    sourceText,
    status: rawStatus,
    submittedAt,
    recipeId: readString(value, 'recipeId'),
    message,
    deduplicated,
    attemptCount: readNullableNumber(value, 'attemptCount'),
    maxAttempts: readNullableNumber(value, 'maxAttempts'),
    nextAttemptAt: readString(value, 'nextAttemptAt'),
    errorCode: readString(value, 'errorCode'),
    errorMessage: readString(value, 'errorMessage'),
    errorRetryable: readBoolean(value, 'errorRetryable'),
  };
}

function readDemoSubmissions(): IImportSubmission[] {
  if (typeof globalThis.localStorage === 'undefined') {
    return [];
  }

  try {
    const storedValue: string | null = globalThis.localStorage.getItem(DEMO_IMPORT_STORAGE_KEY);
    if (storedValue === null) {
      return [];
    }

    const parsedValue: unknown = JSON.parse(storedValue);
    if (!Array.isArray(parsedValue)) {
      return [];
    }

    return parsedValue
      .map((value: unknown): IImportSubmission | null => readDemoSubmission(value))
      .filter((value: IImportSubmission | null): value is IImportSubmission => value !== null);
  } catch {
    return [];
  }
}

function persistDemoSubmissions(submissions: Map<string, IImportSubmission>): void {
  if (typeof globalThis.localStorage === 'undefined') {
    return;
  }

  try {
    globalThis.localStorage.setItem(DEMO_IMPORT_STORAGE_KEY, JSON.stringify([...submissions.values()]));
  } catch {
    // Demo persistence is best-effort when browser storage is unavailable.
  }
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

function requireFolderName(value: string): string {
  const errorMessage: string | null = validateFolderName(value);
  if (errorMessage !== null) {
    throw new SupabaseAdapterError(errorMessage);
  }
  return normalizeFolderName(value);
}

export function createRemoteAdapter(client: TypedSupabaseClient): ISupabaseAdapter {
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

    const [ingredientsResult, stepsResult, folderLinksResult] = await Promise.all([
      client.from('ingredients').select('*').eq('recipe_id', recipeId),
      client.from('steps').select('*').eq('recipe_id', recipeId),
      client.from('recipe_folders').select('*').eq('recipe_id', recipeId),
    ]);

    if (ingredientsResult.error) {
      throw new SupabaseAdapterError('Unable to load this recipe\'s ingredients.', ingredientsResult.error);
    }

    if (stepsResult.error) {
      throw new SupabaseAdapterError('Unable to load this recipe\'s steps.', stepsResult.error);
    }
    if (folderLinksResult.error && !isMissingFolderSchemaError(folderLinksResult.error)) {
      throw new SupabaseAdapterError('Unable to load this recipe\'s folders.', folderLinksResult.error);
    }

    const folderIds: string[] = folderLinksResult.error === null
      ? folderLinksResult.data.map((row: IRecipeFolderRow): string => row.folder_id)
      : [];
    const ingredientIds: string[] = ingredientsResult.data.map(
      (ingredient: IIngredientRow): string => ingredient.id,
    );
    const measurementsResult = ingredientIds.length === 0
      ? { data: [] as IIngredientMeasurementRow[], error: null }
      : await client.from('ingredient_measurements').select('*').in('ingredient_id', ingredientIds);
    if (measurementsResult.error && !isMissingIngredientMeasurementsError(measurementsResult.error)) {
      throw new SupabaseAdapterError('Unable to load this recipe\'s alternate measurements.', measurementsResult.error);
    }
    const measurements: IIngredientMeasurementRow[] = measurementsResult.error === null
      ? measurementsResult.data as IIngredientMeasurementRow[]
      : [];
    return mapRecipeRow(recipeResult.data, ingredientsResult.data, stepsResult.data, measurements, folderIds);
  }

  async function listFolders(): Promise<IFolder[]> {
    const result = await client.from('folders').select('*').order('name', { ascending: true });
    if (result.error) {
      if (isMissingFolderSchemaError(result.error)) {
        return [];
      }
      throw new SupabaseAdapterError('Unable to load your folders.', result.error);
    }
    return result.data.map(mapFolderRow);
  }

  async function createFolder(name: string): Promise<IFolder> {
    const normalizedName: string = requireFolderName(name);
    const result = await client
      .from('folders')
      .insert({ name: normalizedName })
      .select('*')
      .single();
    if (result.error) {
      if (isMissingFolderSchemaError(result.error)) {
        throw folderSchemaUnavailableError(result.error);
      }
      throw new SupabaseAdapterError('Unable to create that folder. Folder names must be unique.', result.error);
    }
    return mapFolderRow(result.data);
  }

  async function renameFolder(folderId: string, name: string): Promise<void> {
    const normalizedName: string = requireFolderName(name);
    const result = await client
      .from('folders')
      .update({ name: normalizedName })
      .eq('id', folderId)
      .select('id')
      .maybeSingle();
    if (result.error) {
      if (isMissingFolderSchemaError(result.error)) {
        throw folderSchemaUnavailableError(result.error);
      }
      throw new SupabaseAdapterError('Unable to rename that folder. Folder names must be unique.', result.error);
    }
    if (result.data === null) {
      throw new SupabaseAdapterError('That folder is no longer available.');
    }
  }

  async function deleteFolder(folderId: string): Promise<void> {
    const result = await client
      .from('folders')
      .delete()
      .eq('id', folderId)
      .select('id')
      .maybeSingle();
    if (result.error) {
      if (isMissingFolderSchemaError(result.error)) {
        throw folderSchemaUnavailableError(result.error);
      }
      throw new SupabaseAdapterError('Unable to delete that folder.', result.error);
    }
    if (result.data === null) {
      throw new SupabaseAdapterError('That folder is no longer available.');
    }
  }

  async function setRecipeFolders(recipeId: string, folderIds: string[]): Promise<void> {
    const uniqueFolderIds: string[] = [...new Set(folderIds)];
    const result = await client.rpc('set_recipe_folders', {
      p_recipe_id: recipeId,
      p_folder_ids: uniqueFolderIds,
    });
    if (result.error) {
      if (isMissingFolderSchemaError(result.error)) {
        throw folderSchemaUnavailableError(result.error);
      }
      throw new SupabaseAdapterError('Unable to update this recipe\'s folders.', result.error);
    }
  }

  async function updateIngredient(
    recipeId: string,
    ingredientId: string,
    input: IIngredientEditInput,
  ): Promise<void> {
    const result = await client
      .from('ingredients')
      .update(toIngredientUpdateRow(input))
      .eq('id', ingredientId)
      .eq('recipe_id', recipeId)
      .select('id')
      .maybeSingle();

    if (result.error) {
      throw new SupabaseAdapterError('Unable to update this ingredient.', result.error);
    }

    if (result.data === null) {
      throw new SupabaseAdapterError('This ingredient is no longer available.');
    }
  }

  async function addIngredientVariation(
    recipeId: string,
    input: IIngredientVariationInput,
  ): Promise<string> {
    const result = await client
      .from('ingredients')
      .insert({
        recipe_id: recipeId,
        ...toIngredientInsertRow(input),
        sort_order: 10_000,
        variation_of_id: input.variationOfId,
      })
      .select('id')
      .maybeSingle();

    if (result.error) {
      throw new SupabaseAdapterError('Unable to add this ingredient variation.', result.error);
    }

    if (result.data === null) {
      throw new SupabaseAdapterError('The ingredient variation was not saved.');
    }

    return result.data.id;
  }

  async function autoLinkRecipe(recipeId: string): Promise<void> {
    const recipe: IRecipe | null = await getRemoteRecipe(recipeId);
    if (recipe === null) {
      throw new SupabaseAdapterError('That recipe is no longer available.');
    }
    const flow = buildDeterministicIngredientFlow(recipe);
    if (flow === null) {
      throw new SupabaseAdapterError('No ingredient mentions were clear enough to link.');
    }

    const result = await client
      .from('recipes')
      .update({ flow_graph: flow })
      .eq('id', recipeId)
      .select('id')
      .maybeSingle();

    if (result.error) {
      throw new SupabaseAdapterError('Unable to update this recipe\'s ingredient links.', result.error);
    }
    if (result.data === null) {
      throw new SupabaseAdapterError('This recipe is no longer available.');
    }
  }

  return {
    mode: 'remote',
    client,
    async listRecipes(): Promise<IRecipeSummary[]> {
      const result = await client.from('recipes').select('*').order('updated_at', { ascending: false });

      if (result.error) {
        throw new SupabaseAdapterError('Unable to load your recipe library.', result.error);
      }

      const folderLinksResult = await client.from('recipe_folders').select('*');
      if (folderLinksResult.error && !isMissingFolderSchemaError(folderLinksResult.error)) {
        throw new SupabaseAdapterError('Unable to load recipe folders.', folderLinksResult.error);
      }
      const folderIdsByRecipeId: Map<string, string[]> = folderLinksResult.error === null
        ? mapFolderLinks(folderLinksResult.data)
        : new Map<string, string[]>();
      return result.data.map((row: IRecipeRow): IRecipeSummary =>
        mapRecipeSummary(row, folderIdsByRecipeId.get(row.id) ?? []));
    },
    listFolders,
    createFolder,
    renameFolder,
    deleteFolder,
    setRecipeFolders,
    async listImportSubmissions(): Promise<IImportSubmission[]> {
      const result = await client
        .from('recipe_import_jobs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);

      if (result.error) {
        throw new SupabaseAdapterError('Unable to load your in-progress imports.', result.error);
      }

      return result.data.map(mapImportJobRow);
    },
    getRecipe: getRemoteRecipe,
    updateIngredient,
    addIngredientVariation,
    autoLinkRecipe,
    async submitImport(request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission> {
      const sourceUrl: string | null = request.sourceUrl?.trim() || null;
      const sourceText: string | null = request.sourceText?.trim() || null;
      const idempotencyKey: string = request.idempotencyKey?.trim() || createImportIdempotencyKey();
      const result = await client.functions.invoke<unknown>('import-recipe-v2', {
        body: {
          source_url: sourceUrl,
          source_text: sourceText,
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
        sourceText,
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
  const recipes: Map<string, IRecipe> = new Map<string, IRecipe>(
    getDemoRecipes().map((recipe: IRecipe): [string, IRecipe] => [recipe.id, recipe]),
  );
  const folders: Map<string, IFolder> = new Map<string, IFolder>(
    getDemoFolders().map((folder: IFolder): [string, IFolder] => [folder.id, folder]),
  );
  let variationCounter: number = 0;
  let folderCounter: number = 0;
  const submissions: Map<string, IImportSubmission> = new Map<string, IImportSubmission>(
    readDemoSubmissions().map((submission: IImportSubmission): [string, IImportSubmission] => [submission.id, submission]),
  );

  return {
    mode: 'demo',
    client: null,
    async listRecipes(): Promise<IRecipeSummary[]> {
      return [...recipes.values()]
        .map(toRecipeSummary)
        .sort((first: IRecipeSummary, second: IRecipeSummary): number =>
          second.updatedAt.localeCompare(first.updatedAt));
    },
    async listFolders(): Promise<IFolder[]> {
      return [...folders.values()]
        .map((folder: IFolder): IFolder => ({ ...folder }))
        .sort((first: IFolder, second: IFolder): number => first.name.localeCompare(second.name));
    },
    async createFolder(name: string): Promise<IFolder> {
      const normalizedName: string = requireFolderName(name);
      ensureDemoFolderNameAvailable(folders, normalizedName);
      folderCounter += 1;
      const now: string = new Date().toISOString();
      const folder: IFolder = {
        id: `demo-folder-${Date.now()}-${folderCounter}`,
        name: normalizedName,
        createdAt: now,
        updatedAt: now,
      };
      folders.set(folder.id, folder);
      return { ...folder };
    },
    async renameFolder(folderId: string, name: string): Promise<void> {
      const folder: IFolder = getDemoFolderForMutation(folders, folderId);
      const normalizedName: string = requireFolderName(name);
      ensureDemoFolderNameAvailable(folders, normalizedName, folderId);
      folder.name = normalizedName;
      folder.updatedAt = new Date().toISOString();
    },
    async deleteFolder(folderId: string): Promise<void> {
      getDemoFolderForMutation(folders, folderId);
      folders.delete(folderId);
      for (const recipe of recipes.values()) {
        recipe.folderIds = (recipe.folderIds ?? []).filter(
          (currentFolderId: string): boolean => currentFolderId !== folderId,
        );
      }
    },
    async setRecipeFolders(recipeId: string, folderIds: string[]): Promise<void> {
      const recipe: IRecipe = getDemoRecipeForMutation(recipes, recipeId);
      const uniqueFolderIds: string[] = [...new Set(folderIds)];
      if (uniqueFolderIds.some((folderId: string): boolean => !folders.has(folderId))) {
        throw new SupabaseAdapterError('One of those folders is no longer available.');
      }
      recipe.folderIds = uniqueFolderIds;
      recipe.updatedAt = new Date().toISOString();
    },
    async listImportSubmissions(): Promise<IImportSubmission[]> {
      return [...submissions.values()].sort(
        (first: IImportSubmission, second: IImportSubmission): number =>
          second.submittedAt.localeCompare(first.submittedAt),
      );
    },
    async getRecipe(recipeId: string): Promise<IRecipe | null> {
      const recipe: IRecipe | undefined = recipes.get(recipeId);
      return recipe === undefined ? getDemoRecipe(recipeId) : copyDemoRecipe(recipe);
    },
    async updateIngredient(
      recipeId: string,
      ingredientId: string,
      input: IIngredientEditInput,
    ): Promise<void> {
      const recipe: IRecipe = getDemoRecipeForMutation(recipes, recipeId);
      const ingredient: IRecipeIngredient | undefined = recipe.ingredients.find(
        (item: IRecipeIngredient): boolean => item.id === ingredientId,
      );
      if (ingredient === undefined) {
        throw new SupabaseAdapterError('This ingredient is no longer available.');
      }

      Object.assign(ingredient, input);
      recipe.updatedAt = new Date().toISOString();
    },
    async addIngredientVariation(
      recipeId: string,
      input: IIngredientVariationInput,
    ): Promise<string> {
      const recipe: IRecipe = getDemoRecipeForMutation(recipes, recipeId);
      const sourceIngredient: IRecipeIngredient | undefined = recipe.ingredients.find(
        (item: IRecipeIngredient): boolean => item.id === input.variationOfId,
      );
      if (sourceIngredient === undefined) {
        throw new SupabaseAdapterError('The source ingredient is no longer available.');
      }

      variationCounter += 1;
      const variationId: string = `demo-variation-${Date.now()}-${variationCounter}`;
      recipe.ingredients.push({
        id: variationId,
        quantity: input.quantity,
        unit: input.unit,
        name: input.name,
        note: input.note,
        variationOfId: sourceIngredient.id,
      });
      recipe.updatedAt = new Date().toISOString();
      return variationId;
    },
    async autoLinkRecipe(recipeId: string): Promise<void> {
      const recipe: IRecipe = getDemoRecipeForMutation(recipes, recipeId);
      const flow = buildDeterministicIngredientFlow(recipe);
      if (flow === null) {
        throw new SupabaseAdapterError('No ingredient mentions were clear enough to link.');
      }
      recipe.flow = flow;
      recipe.updatedAt = new Date().toISOString();
    },
    async submitImport(request: IImportRequestWithIdempotencyKey): Promise<IImportSubmission> {
      demoImportSubmissionCounter += 1;
      const submissionId: string = `demo-import-${Date.now()}-${demoImportSubmissionCounter}`;
      const submission: IImportSubmission = {
        id: submissionId,
        jobId: submissionId,
        sourceUrl: request.sourceUrl,
        sourceText: request.sourceText ?? null,
        status: 'parsing',
        submittedAt: new Date().toISOString(),
        recipeId: null,
        message: request.sourceText === undefined
          ? 'Demo mode queued the URL locally. Add Supabase keys to connect the real importer.'
          : 'Demo mode queued the pasted recipe locally. Add Supabase keys to connect the real importer.',
        deduplicated: false,
        attemptCount: 0,
        maxAttempts: 3,
        nextAttemptAt: null,
        errorCode: null,
        errorMessage: null,
        errorRetryable: null,
      };
      submissions.set(submission.id, submission);
      persistDemoSubmissions(submissions);
      return submission;
    },
    async getImportSubmission(submissionId: string): Promise<IImportSubmission | null> {
      return submissions.get(submissionId) ?? null;
    },
  };
}

function getDemoRecipeForMutation(recipes: Map<string, IRecipe>, recipeId: string): IRecipe {
  const recipe: IRecipe | undefined = recipes.get(recipeId);
  if (recipe === undefined) {
    throw new SupabaseAdapterError('That recipe is no longer available.');
  }

  return recipe;
}

function getDemoFolderForMutation(folders: Map<string, IFolder>, folderId: string): IFolder {
  const folder: IFolder | undefined = folders.get(folderId);
  if (folder === undefined) {
    throw new SupabaseAdapterError('That folder is no longer available.');
  }
  return folder;
}

function ensureDemoFolderNameAvailable(
  folders: Map<string, IFolder>,
  name: string,
  ignoredFolderId: string | null = null,
): void {
  const normalizedName: string = name.toLocaleLowerCase();
  const duplicate: IFolder | undefined = [...folders.values()].find(
    (folder: IFolder): boolean =>
      folder.id !== ignoredFolderId && folder.name.toLocaleLowerCase() === normalizedName,
  );
  if (duplicate !== undefined) {
    throw new SupabaseAdapterError('A folder with that name already exists.');
  }
}

function toRecipeSummary(recipe: IRecipe): IRecipeSummary {
  return {
    id: recipe.id,
    title: recipe.title,
    description: recipe.description,
    collection: recipe.collection,
    folderIds: recipe.folderIds === undefined ? [] : [...recipe.folderIds],
    tags: [...recipe.tags],
    sourceUrl: recipe.sourceUrl,
    servings: recipe.servings,
    prepMinutes: recipe.prepMinutes,
    cookMinutes: recipe.cookMinutes,
    updatedAt: recipe.updatedAt,
    status: recipe.status,
  };
}

function copyDemoRecipe(recipe: IRecipe): IRecipe {
  return {
    ...recipe,
    tags: [...recipe.tags],
    folderIds: recipe.folderIds === undefined ? undefined : [...recipe.folderIds],
    ingredients: recipe.ingredients.map((ingredient: IRecipeIngredient): IRecipeIngredient => ({ ...ingredient })),
    steps: recipe.steps.map((step) => ({ ...step })),
    flow: recipe.flow === undefined || recipe.flow === null
      ? recipe.flow
      : {
        derivation: recipe.flow.derivation,
        nodes: recipe.flow.nodes.map((node) => ({ ...node, ingredientIds: [...node.ingredientIds] })),
        edges: recipe.flow.edges.map((edge) => ({ ...edge })),
      },
  };
}

function toIngredientUpdateRow(input: IIngredientEditInput): {
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
} {
  const unit: string | null = normalizeOptionalText(input.unit);
  const note: string | null = normalizeOptionalText(input.note);
  return {
    quantity: input.quantity,
    unit,
    name: input.name.trim(),
    notes: note,
  };
}

function toIngredientInsertRow(input: IIngredientEditInput): {
  original_text: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  notes: string | null;
} {
  const updateRow = toIngredientUpdateRow(input);
  return {
    ...updateRow,
    original_text: formatOriginalIngredientText(updateRow.quantity, updateRow.unit, updateRow.name),
  };
}

function formatOriginalIngredientText(quantity: number | null, unit: string | null, name: string): string {
  const quantityLabel: string = quantity === null ? '' : quantity.toString();
  return [quantityLabel, unit ?? '', name.trim()].filter((value: string): boolean => value.length > 0).join(' ');
}

function normalizeOptionalText(value: string | null): string | null {
  const trimmedValue: string = value?.trim() ?? '';
  return trimmedValue.length === 0 ? null : trimmedValue;
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
