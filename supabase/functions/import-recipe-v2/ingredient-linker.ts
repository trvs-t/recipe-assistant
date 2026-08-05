import {
  type IngredientLinkingIngredient,
  type IngredientLinkingInput,
  type IngredientLinkingStep,
  type RecipeFlow,
  type RecipeFlowEdge,
  type RecipeFlowNode,
} from "./types.ts";

export const INGREDIENT_LINK_CONFIDENCE_THRESHOLD: number = 0.7;

export function createDeterministicIngredientFlow(
  input: IngredientLinkingInput,
): RecipeFlow | null {
  const links: Map<string, string[]> = new Map<string, string[]>();
  for (const step of input.steps) {
    const matchedIngredientIds: string[] = input.ingredients
      .filter((ingredient: IngredientLinkingIngredient): boolean =>
        ingredientMentioned(ingredient, step)
      )
      .map((ingredient: IngredientLinkingIngredient): string => ingredient.id);
    if (matchedIngredientIds.length > 0) {
      links.set(step.id, matchedIngredientIds);
    }
  }

  return createFlow(input.steps, links);
}

export function parseIngredientLinkOutput(
  value: unknown,
  input: IngredientLinkingInput,
): RecipeFlow | null {
  if (!isRecord(value) || !Array.isArray(value["links"])) {
    return null;
  }

  const stepIds: Set<string> = new Set<string>(
    input.steps.map((step: IngredientLinkingStep): string => step.id),
  );
  const ingredientIds: Set<string> = new Set<string>(
    input.ingredients.map((ingredient: IngredientLinkingIngredient): string =>
      ingredient.id
    ),
  );
  const links: Map<string, string[]> = new Map<string, string[]>();

  for (const rawLink of value["links"]) {
    if (!isRecord(rawLink)) {
      continue;
    }

    const stepId: string | null = nonEmptyString(
      rawLink["stepId"] ?? rawLink["step_id"],
    );
    const confidence: number = typeof rawLink["confidence"] === "number"
      ? rawLink["confidence"]
      : 0;
    const rawIngredientIds: unknown = rawLink["ingredientIds"] ??
      rawLink["ingredient_ids"];
    if (
      stepId === null ||
      !stepIds.has(stepId) ||
      !Array.isArray(rawIngredientIds) ||
      !Number.isFinite(confidence) ||
      confidence < INGREDIENT_LINK_CONFIDENCE_THRESHOLD
    ) {
      continue;
    }

    const validIngredientIds: string[] = rawIngredientIds
      .filter((ingredientId: unknown): ingredientId is string =>
        typeof ingredientId === "string" && ingredientIds.has(ingredientId)
      )
      .filter(uniqueString);
    if (validIngredientIds.length > 0) {
      links.set(stepId, validIngredientIds);
    }
  }

  return createFlow(input.steps, links);
}

export function mergeIngredientFlows(
  primary: RecipeFlow | null,
  supplemental: RecipeFlow | null,
  steps: readonly IngredientLinkingStep[],
): RecipeFlow | null {
  const links: Map<string, string[]> = new Map<string, string[]>();
  for (const flow of [primary, supplemental]) {
    if (flow === null || flow.derivation !== "enriched") {
      continue;
    }
    for (const node of flow.nodes) {
      const current: string[] = links.get(node.stepId) ?? [];
      links.set(
        node.stepId,
        [...current, ...node.ingredientIds].filter(uniqueString),
      );
    }
  }

  return createFlow(steps, links);
}

function createFlow(
  steps: readonly IngredientLinkingStep[],
  links: Map<string, string[]>,
): RecipeFlow | null {
  const linkedIngredientCount: number = [...links.values()]
    .reduce(
      (total: number, ingredientIds: string[]): number =>
        total + ingredientIds.length,
      0,
    );
  if (linkedIngredientCount === 0) {
    return null;
  }

  const nodes: readonly RecipeFlowNode[] = steps.map(
    (step: IngredientLinkingStep): RecipeFlowNode => ({
      id: `node:${step.id}`,
      stepId: step.id,
      ingredientIds: links.get(step.id) ?? [],
    }),
  );
  const edges: readonly RecipeFlowEdge[] = steps.slice(1).map(
    (step: IngredientLinkingStep, index: number): RecipeFlowEdge => {
      const previous: IngredientLinkingStep | undefined = steps[index];
      if (previous === undefined) {
        throw new Error("Ingredient-linking flow predecessor is missing");
      }
      return {
        id: `edge:${previous.id}:${step.id}`,
        fromNodeId: `node:${previous.id}`,
        toNodeId: `node:${step.id}`,
        kind: "sequence",
      };
    },
  );

  return { derivation: "enriched", nodes, edges };
}

function ingredientMentioned(
  ingredient: IngredientLinkingIngredient,
  step: IngredientLinkingStep,
): boolean {
  const stepText: string = normalizeText(step.instruction);
  const ingredientText: string = normalizeText(ingredient.name);
  if (ingredientText.length === 0) {
    return false;
  }
  if (containsPhrase(stepText, ingredientText)) {
    return true;
  }

  const ingredientTokens: string[] = significantTokens(ingredientText);
  const stepTokens: Set<string> = new Set<string>(significantTokens(stepText));
  if (ingredientTokens.length === 0) {
    return false;
  }

  const matchedTokens: number = ingredientTokens.filter(
    (token: string): boolean => stepTokens.has(token),
  ).length;
  return matchedTokens >= Math.max(1, Math.ceil(ingredientTokens.length * 0.6));
}

function containsPhrase(text: string, phrase: string): boolean {
  return (` ${text} `).includes(` ${phrase} `);
}

function normalizeText(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

function significantTokens(value: string): string[] {
  return value.split(" ").filter(
    (token: string): boolean => token.length > 2 && !LINK_STOP_WORDS.has(token),
  );
}

const LINK_STOP_WORDS: ReadonlySet<string> = new Set<string>([
  "and",
  "for",
  "from",
  "into",
  "more",
  "once",
  "over",
  "the",
  "then",
  "this",
  "until",
  "with",
]);

function uniqueString(value: string, index: number, values: string[]): boolean {
  return values.indexOf(value) === index;
}

function nonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  const trimmed: string = value.trim();
  return trimmed.length === 0 ? null : trimmed;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
