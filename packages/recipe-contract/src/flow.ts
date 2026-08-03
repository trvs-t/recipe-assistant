import type { Ingredient, RecipeFlow, RecipeStep } from "./schemas";

export interface FlowValidationResult {
  valid: boolean;
  errors: string[];
}

export function createLinearFlow(steps: readonly RecipeStep[]): RecipeFlow {
  const orderedSteps: RecipeStep[] = [...steps].sort(
    (left: RecipeStep, right: RecipeStep): number =>
      left.sortOrder - right.sortOrder,
  );

  return {
    derivation: "linear_fallback",
    nodes: orderedSteps.map((step: RecipeStep) => ({
      id: `node:${step.id}`,
      stepId: step.id,
      ingredientIds: [],
    })),
    edges: orderedSteps.slice(1).map((step: RecipeStep, index: number) => {
      const previousStep: RecipeStep | undefined = orderedSteps[index];
      if (!previousStep) {
        throw new Error("Linear flow predecessor is missing");
      }

      return {
        id: `edge:${previousStep.id}:${step.id}`,
        fromNodeId: `node:${previousStep.id}`,
        toNodeId: `node:${step.id}`,
        kind: "sequence" as const,
      };
    }),
  };
}

export function validateRecipeFlow(
  flow: RecipeFlow,
  steps: readonly RecipeStep[],
  ingredients: readonly Ingredient[],
): FlowValidationResult {
  const errors: string[] = [];
  const stepIds: Set<string> = new Set(
    steps.map((step: RecipeStep) => step.id),
  );
  const ingredientIds: Set<string> = new Set(
    ingredients.map((ingredient: Ingredient) => ingredient.id),
  );
  const nodeIds: Set<string> = new Set();
  const stepNodeIds: Set<string> = new Set();

  for (const node of flow.nodes) {
    if (nodeIds.has(node.id)) {
      errors.push(`Duplicate flow node: ${node.id}`);
    }
    nodeIds.add(node.id);

    if (!stepIds.has(node.stepId)) {
      errors.push(`Flow node references missing step: ${node.stepId}`);
    }
    if (stepNodeIds.has(node.stepId)) {
      errors.push(`Step appears in multiple flow nodes: ${node.stepId}`);
    }
    stepNodeIds.add(node.stepId);

    for (const ingredientId of node.ingredientIds) {
      if (!ingredientIds.has(ingredientId)) {
        errors.push(`Flow node references missing ingredient: ${ingredientId}`);
      }
    }
  }

  for (const stepId of stepIds) {
    if (!stepNodeIds.has(stepId)) {
      errors.push(`Flow graph omits step: ${stepId}`);
    }
  }

  const adjacency: Map<string, string[]> = new Map(
    [...nodeIds].map((nodeId: string) => [nodeId, []]),
  );
  const inDegree: Map<string, number> = new Map(
    [...nodeIds].map((nodeId: string) => [nodeId, 0]),
  );

  for (const edge of flow.edges) {
    if (!nodeIds.has(edge.fromNodeId) || !nodeIds.has(edge.toNodeId)) {
      errors.push(`Flow edge references a missing node: ${edge.id}`);
      continue;
    }
    if (edge.fromNodeId === edge.toNodeId) {
      errors.push(`Flow edge cannot point to itself: ${edge.id}`);
      continue;
    }

    adjacency.get(edge.fromNodeId)?.push(edge.toNodeId);
    inDegree.set(edge.toNodeId, (inDegree.get(edge.toNodeId) ?? 0) + 1);
  }

  const ready: string[] = [...inDegree.entries()]
    .filter((entry: [string, number]): boolean => entry[1] === 0)
    .map((entry: [string, number]): string => entry[0]);
  let visited: number = 0;

  while (ready.length > 0) {
    const nodeId: string | undefined = ready.pop();
    if (!nodeId) {
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

  if (visited !== nodeIds.size) {
    errors.push("Flow graph contains a cycle");
  }

  return { valid: errors.length === 0, errors };
}
