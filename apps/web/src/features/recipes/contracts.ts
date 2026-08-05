export type RecipeStatus = 'pending' | 'parsing' | 'parsed' | 'draft' | 'error';

export type ImportSubmissionStatus = Exclude<RecipeStatus, 'draft'>;

export type RecipeFlowDerivation = 'enriched' | 'linear_fallback';

export type RecipeFlowEdgeKind = 'sequence' | 'dependency';

export interface IRecipeFlowNode {
  id: string;
  stepId: string;
  ingredientIds: string[];
}

export interface IRecipeFlowEdge {
  id: string;
  fromNodeId: string;
  toNodeId: string;
  kind: RecipeFlowEdgeKind;
}

export interface IRecipeFlow {
  derivation: RecipeFlowDerivation;
  nodes: IRecipeFlowNode[];
  edges: IRecipeFlowEdge[];
}

export type RecipeFlow = IRecipeFlow;
export type RecipeFlowNode = IRecipeFlowNode;
export type RecipeFlowEdge = IRecipeFlowEdge;

export interface IRecipeIngredient {
  id: string;
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
  variationOfId?: string | null;
}

export interface IIngredientEditInput {
  quantity: number | null;
  unit: string | null;
  name: string;
  note: string | null;
}

export interface IRecipeStep {
  id: string;
  title: string;
  description: string;
  durationMinutes: number | null;
}

export interface IRecipeSummary {
  id: string;
  title: string;
  description: string;
  collection: string;
  tags: string[];
  sourceUrl: string | null;
  servings: number;
  prepMinutes: number | null;
  cookMinutes: number | null;
  updatedAt: string;
  status: RecipeStatus;
}

export interface IRecipe extends IRecipeSummary {
  ingredients: IRecipeIngredient[];
  steps: IRecipeStep[];
  sourceText?: string | null;
  /**
   * Older adapters may omit enrichment. The detail view derives a canonical
   * linear flow when this value is absent or invalid.
   */
  flow?: IRecipeFlow | null;
}

export interface IImportRequest {
  sourceUrl: string | null;
  sourceText?: string;
}

export interface IImportSubmission {
  id: string;
  sourceUrl: string | null;
  sourceText: string | null;
  status: ImportSubmissionStatus;
  submittedAt: string;
  recipeId: string | null;
  message: string;
}

export function isRecipeStatus(value: string | null): value is RecipeStatus {
  return (
    value === 'pending' ||
    value === 'parsing' ||
    value === 'parsed' ||
    value === 'draft' ||
    value === 'error'
  );
}

export function isImportSubmissionStatus(
  value: string | null,
): value is ImportSubmissionStatus {
  return value === 'pending' || value === 'parsing' || value === 'parsed' || value === 'error';
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null;
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isRecipeFlowNode(value: unknown): value is IRecipeFlowNode {
  if (!isRecord(value) || !isNonEmptyString(value.id) || !isNonEmptyString(value.stepId)) {
    return false;
  }

  const ingredientIds: unknown = value.ingredientIds;
  return Array.isArray(ingredientIds) && ingredientIds.every(isNonEmptyString);
}

function isRecipeFlowEdge(value: unknown): value is IRecipeFlowEdge {
  if (
    !isRecord(value) ||
    !isNonEmptyString(value.id) ||
    !isNonEmptyString(value.fromNodeId) ||
    !isNonEmptyString(value.toNodeId)
  ) {
    return false;
  }

  return value.kind === 'sequence' || value.kind === 'dependency';
}

/** Check the runtime shape before a flow is used by the visualization. */
export function isRecipeFlow(value: unknown): value is IRecipeFlow {
  if (!isRecord(value)) {
    return false;
  }

  const nodes: unknown = value.nodes;
  const edges: unknown = value.edges;
  return (
    (value.derivation === 'enriched' || value.derivation === 'linear_fallback') &&
    Array.isArray(nodes) &&
    nodes.every(isRecipeFlowNode) &&
    Array.isArray(edges) &&
    edges.every(isRecipeFlowEdge)
  );
}

/** Build the canonical deterministic fallback used when enrichment is unavailable. */
export function createLinearRecipeFlow(steps: readonly IRecipeStep[]): IRecipeFlow {
  const nodes: IRecipeFlowNode[] = steps.map((step: IRecipeStep): IRecipeFlowNode => ({
    id: `node:${step.id}`,
    stepId: step.id,
    ingredientIds: [],
  }));

  const edges: IRecipeFlowEdge[] = steps.slice(1).map((step: IRecipeStep, index: number): IRecipeFlowEdge => {
    const previousStep: IRecipeStep | undefined = steps[index];
    if (previousStep === undefined) {
      throw new Error('Linear recipe flow predecessor is missing');
    }

    return {
      id: `edge:${previousStep.id}:${step.id}`,
      fromNodeId: `node:${previousStep.id}`,
      toNodeId: `node:${step.id}`,
      kind: 'sequence',
    };
  });

  return {
    derivation: 'linear_fallback',
    nodes,
    edges,
  };
}
