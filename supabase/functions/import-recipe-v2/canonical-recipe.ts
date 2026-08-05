import {
  type NormalizedRecipe,
  type NormalizedRecipeStep,
  type RecipeFlow,
  type RecipeFlowEdge,
  type RecipeFlowNode,
  type RecipeIngredient,
} from "./types.ts";
import { PipelineError } from "./errors.ts";

export interface CanonicalIngredientPayload {
  readonly id: string;
  readonly originalText: string;
  readonly quantity: number | null;
  readonly unit: string | null;
  readonly name: string;
  readonly notes: string | null;
  readonly sortOrder: number;
}

export interface CanonicalStepPayload {
  readonly id: string;
  readonly instruction: string;
  readonly timerDurationMinutes: number | null;
  readonly sortOrder: number;
}

export interface CanonicalRecipePayload {
  readonly sourceUrl: string | null;
  readonly title: string;
  readonly description: string | null;
  readonly prepTimeMinutes: number | null;
  readonly cookTimeMinutes: number | null;
  readonly totalTimeMinutes: number | null;
  readonly servings: number | null;
  readonly images: readonly string[];
  readonly cuisineType: string | null;
  readonly dietaryTags: readonly string[];
  readonly status: "ready";
  readonly parseConfidence: number | null;
  readonly ingredients: readonly CanonicalIngredientPayload[];
  readonly steps: readonly CanonicalStepPayload[];
  readonly flow: RecipeFlow;
}

export function mapToCanonicalRecipe(
  recipe: NormalizedRecipe,
  source_url: string | null,
): CanonicalRecipePayload {
  assertSemanticallyValidRecipe(recipe);
  const ingredients: readonly CanonicalIngredientPayload[] = recipe.ingredients
    .map(
      (
        ingredient: RecipeIngredient,
        index: number,
      ): CanonicalIngredientPayload => ({
        id: stableId(ingredient.id, "ingredient", index),
        originalText: ingredient.original,
        quantity: positiveOrNull(ingredient.quantity),
        unit: ingredient.unit,
        name: ingredient.name,
        notes: ingredient.notes,
        sortOrder: nonNegativeIntegerOrDefault(ingredient.sort_order, index),
      }),
    );

  const steps: readonly CanonicalStepPayload[] = recipeSteps(recipe).map(
    (
      step: NormalizedRecipeStep | string,
      index: number,
    ): CanonicalStepPayload => {
      if (typeof step === "string") {
        return {
          id: `step:${index}`,
          instruction: step,
          timerDurationMinutes: null,
          sortOrder: index,
        };
      }

      return {
        id: stableId(step.id, "step", index),
        instruction: step.instruction,
        timerDurationMinutes: positiveIntegerOrNull(
          step.timer_duration_minutes,
        ),
        sortOrder: nonNegativeIntegerOrDefault(step.sort_order, index),
      };
    },
  );

  const flow: RecipeFlow = validFlow(recipe.flow, steps) ??
    createLinearFlow(steps);
  const images: readonly string[] = recipe.images !== undefined
    ? [...recipe.images]
    : recipe.image_url === null
    ? []
    : [recipe.image_url];
  const total_time_minutes: number | null =
    recipe.total_time_minutes !== undefined
      ? nonNegativeIntegerOrNull(recipe.total_time_minutes)
      : sumTimes(recipe.prep_time_minutes, recipe.cook_time_minutes);

  return {
    sourceUrl: source_url,
    title: recipe.title,
    description: recipe.description,
    prepTimeMinutes: nonNegativeIntegerOrNull(recipe.prep_time_minutes),
    cookTimeMinutes: nonNegativeIntegerOrNull(recipe.cook_time_minutes),
    totalTimeMinutes: total_time_minutes,
    servings: positiveIntegerOrNull(recipe.servings),
    images,
    cuisineType: recipe.cuisine_type ?? null,
    dietaryTags: recipe.dietary_tags === undefined
      ? []
      : [...recipe.dietary_tags],
    status: "ready",
    parseConfidence: boundedConfidence(recipe.parse_confidence),
    ingredients,
    steps,
    flow,
  };
}

export function assertSemanticallyValidRecipe(recipe: NormalizedRecipe): void {
  if (recipe.title.trim().length === 0) {
    throw invalidRecipe("Recipe title must not be empty");
  }
  if (recipe.ingredients.length === 0) {
    throw invalidRecipe("Recipe must contain at least one ingredient");
  }
  for (const ingredient of recipe.ingredients) {
    if (
      ingredient.name.trim().length === 0 ||
      ingredient.original.trim().length === 0
    ) {
      throw invalidRecipe("Recipe ingredients must contain meaningful text");
    }
    if (
      ingredient.quantity !== null &&
      (!Number.isFinite(ingredient.quantity) || ingredient.quantity <= 0)
    ) {
      throw invalidRecipe(
        "Explicit ingredient quantities must be greater than zero",
      );
    }
  }
  if (
    recipe.steps.length === 0 ||
    recipe.steps.some((step: string): boolean => step.trim().length === 0)
  ) {
    throw invalidRecipe("Recipe must contain at least one non-empty step");
  }
  if (
    recipe.servings !== null &&
    (!Number.isFinite(recipe.servings) || recipe.servings <= 0)
  ) {
    throw invalidRecipe(
      "Recipe servings must be greater than zero when supplied",
    );
  }
}

function invalidRecipe(message: string): PipelineError {
  return new PipelineError({
    code: "RECIPE_OUTPUT_INVALID",
    message,
    stage: "validate",
    retryable: false,
  });
}

export function createLinearFlow(
  steps: readonly CanonicalStepPayload[],
): RecipeFlow {
  const orderedSteps: readonly CanonicalStepPayload[] = [...steps].sort(
    (left: CanonicalStepPayload, right: CanonicalStepPayload): number =>
      left.sortOrder - right.sortOrder || left.id.localeCompare(right.id),
  );
  const nodes: readonly RecipeFlowNode[] = orderedSteps.map(
    (step: CanonicalStepPayload): RecipeFlowNode => ({
      id: `node:${step.id}`,
      stepId: step.id,
      ingredientIds: [],
    }),
  );
  const edges: readonly RecipeFlowEdge[] = orderedSteps.slice(1).map(
    (step: CanonicalStepPayload, index: number): RecipeFlowEdge => {
      const previous: CanonicalStepPayload | undefined = orderedSteps[index];
      if (previous === undefined) {
        throw new Error("Linear flow predecessor is missing");
      }
      return {
        id: `edge:${previous.id}:${step.id}`,
        fromNodeId: `node:${previous.id}`,
        toNodeId: `node:${step.id}`,
        kind: "sequence",
      };
    },
  );
  return { derivation: "linear_fallback", nodes, edges };
}

function recipeSteps(
  recipe: NormalizedRecipe,
): readonly (string | NormalizedRecipeStep)[] {
  if (
    recipe.step_details !== undefined &&
    recipe.step_details.length === recipe.steps.length
  ) {
    return recipe.step_details;
  }
  return recipe.steps;
}

function validFlow(
  flow: RecipeFlow | undefined,
  steps: readonly CanonicalStepPayload[],
): RecipeFlow | null {
  if (flow === undefined || flow.derivation !== "enriched") {
    return null;
  }

  const stepIds: Set<string> = new Set<string>(
    steps.map((step): string => step.id),
  );
  const nodeIds: Set<string> = new Set<string>();
  const coveredSteps: Set<string> = new Set<string>();
  for (const node of flow.nodes) {
    if (
      nodeIds.has(node.id) || coveredSteps.has(node.stepId) ||
      !stepIds.has(node.stepId)
    ) {
      return null;
    }
    nodeIds.add(node.id);
    coveredSteps.add(node.stepId);
    for (const ingredient_id of node.ingredientIds) {
      if (typeof ingredient_id !== "string" || ingredient_id.length === 0) {
        return null;
      }
    }
  }
  if (coveredSteps.size !== stepIds.size) {
    return null;
  }

  const adjacency: Map<string, string[]> = new Map<string, string[]>(
    [...nodeIds].map((node_id: string): [string, string[]] => [node_id, []]),
  );
  const indegree: Map<string, number> = new Map<string, number>(
    [...nodeIds].map((node_id: string): [string, number] => [node_id, 0]),
  );
  const edgeIds: Set<string> = new Set<string>();
  for (const edge of flow.edges) {
    if (
      edgeIds.has(edge.id) ||
      !nodeIds.has(edge.fromNodeId) ||
      !nodeIds.has(edge.toNodeId) ||
      edge.fromNodeId === edge.toNodeId
    ) {
      return null;
    }
    edgeIds.add(edge.id);
    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    indegree.set(edge.toNodeId, (indegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const ready: string[] = [...indegree.entries()]
    .filter((entry: [string, number]): boolean => entry[1] === 0)
    .map((entry: [string, number]): string => entry[0]);
  let visited: number = 0;
  while (ready.length > 0) {
    const node_id: string | undefined = ready.pop();
    if (node_id === undefined) {
      break;
    }
    visited += 1;
    for (const next_id of adjacency.get(node_id) ?? []) {
      const next_degree: number = (indegree.get(next_id) ?? 0) - 1;
      indegree.set(next_id, next_degree);
      if (next_degree === 0) {
        ready.push(next_id);
      }
    }
  }
  return visited === nodeIds.size ? flow : null;
}

function stableId(
  value: string | undefined,
  prefix: string,
  index: number,
): string {
  const trimmed: string = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : `${prefix}:${index}`;
}

function nonNegativeIntegerOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return value !== undefined && Number.isInteger(value) && value >= 0
    ? value
    : fallback;
}

function nonNegativeIntegerOrNull(
  value: number | null | undefined,
): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.max(0, Math.round(value));
}

function positiveIntegerOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return Math.max(1, Math.round(value));
}

function positiveOrNull(value: number | null): number | null {
  if (value === null || !Number.isFinite(value) || value <= 0) {
    return null;
  }
  return value;
}

function sumTimes(prep: number | null, cook: number | null): number | null {
  if (prep === null && cook === null) {
    return null;
  }
  return nonNegativeIntegerOrNull((prep ?? 0) + (cook ?? 0));
}

function boundedConfidence(value: number | null | undefined): number | null {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.min(1, Math.max(0, value));
}
