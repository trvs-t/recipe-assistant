import type {
  IRecipe,
  IRecipeFlow,
  IRecipeFlowEdge,
  IRecipeFlowNode,
  IRecipeIngredient,
  IRecipeStep,
} from './contracts';

export function buildDeterministicIngredientFlow(recipe: IRecipe): IRecipeFlow | null {
  const linksByStepId: Map<string, string[]> = new Map<string, string[]>();
  for (const step of recipe.steps) {
    const ingredientIds: string[] = recipe.ingredients
      .filter((ingredient: IRecipeIngredient): boolean => ingredientMentioned(ingredient, step))
      .map((ingredient: IRecipeIngredient): string => ingredient.id);
    if (ingredientIds.length > 0) {
      linksByStepId.set(step.id, ingredientIds);
    }
  }

  if (linksByStepId.size === 0) {
    return null;
  }

  const nodes: IRecipeFlowNode[] = recipe.steps.map((step: IRecipeStep): IRecipeFlowNode => ({
    id: `node:${step.id}`,
    stepId: step.id,
    ingredientIds: linksByStepId.get(step.id) ?? [],
  }));
  const edges: IRecipeFlowEdge[] = recipe.steps.slice(1).map(
    (step: IRecipeStep, index: number): IRecipeFlowEdge => {
      const previousStep: IRecipeStep | undefined = recipe.steps[index];
      if (previousStep === undefined) {
        throw new Error('Ingredient-linking flow predecessor is missing');
      }
      return {
        id: `edge:${previousStep.id}:${step.id}`,
        fromNodeId: `node:${previousStep.id}`,
        toNodeId: `node:${step.id}`,
        kind: 'sequence',
      };
    },
  );

  return { derivation: 'enriched', nodes, edges };
}

export function hasIngredientLinks(flow: IRecipeFlow | null | undefined): boolean {
  return flow?.derivation === 'enriched' && flow.nodes.some(
    (node: IRecipeFlowNode): boolean => node.ingredientIds.length > 0,
  );
}

export function needsIngredientLinkRepair(recipe: IRecipe): boolean {
  if (recipe.ingredients.length === 0 || recipe.steps.length === 0) {
    return false;
  }
  if (recipe.flow?.derivation !== 'enriched') {
    return true;
  }

  const nodesByStepId: Map<string, IRecipeFlowNode> = new Map<string, IRecipeFlowNode>(
    recipe.flow.nodes.map((node: IRecipeFlowNode): [string, IRecipeFlowNode] => [node.stepId, node]),
  );
  return recipe.steps.some((step: IRecipeStep): boolean =>
    (nodesByStepId.get(step.id)?.ingredientIds.length ?? 0) === 0,
  );
}

function ingredientMentioned(ingredient: IRecipeIngredient, step: IRecipeStep): boolean {
  const stepText: string = normalizeText(step.description);
  const ingredientText: string = normalizeText(ingredient.name);
  if (ingredientText.length === 0) {
    return false;
  }
  if ((` ${stepText} `).includes(` ${ingredientText} `)) {
    return true;
  }

  const ingredientTokens: string[] = significantTokens(ingredientText);
  const stepTokens: Set<string> = new Set<string>(significantTokens(stepText));
  const matchedTokens: number = ingredientTokens.filter(
    (token: string): boolean => stepTokens.has(token),
  ).length;
  return ingredientTokens.length > 0 && matchedTokens >= Math.max(1, Math.ceil(ingredientTokens.length * 0.6));
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function significantTokens(value: string): string[] {
  return value.split(' ').filter(
    (token: string): boolean => token.length > 2 && !LINK_STOP_WORDS.has(token),
  );
}

const LINK_STOP_WORDS: ReadonlySet<string> = new Set<string>([
  'and',
  'for',
  'from',
  'into',
  'more',
  'once',
  'over',
  'the',
  'then',
  'this',
  'until',
  'with',
]);
