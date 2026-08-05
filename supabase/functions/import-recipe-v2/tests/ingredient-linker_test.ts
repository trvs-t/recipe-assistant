import { assertDeepEquals, assertEquals } from "./assertions.ts";
import {
  createDeterministicIngredientFlow,
  mergeIngredientFlows,
  parseIngredientLinkOutput,
} from "../ingredient-linker.ts";
import {
  OpenRouterNormalizer,
  type OpenRouterTransport,
} from "../openrouter-normalizer.ts";
import { type IngredientLinkingInput, type RecipeFlow } from "../types.ts";

const input: IngredientLinkingInput = {
  ingredients: [
    { id: "ingredient:0", originalText: "2 cups rice", name: "rice" },
    { id: "ingredient:1", originalText: "1 tbsp soy sauce", name: "soy sauce" },
  ],
  steps: [
    { id: "step:0", instruction: "Cook the rice until tender." },
    { id: "step:1", instruction: "Stir in the soy sauce and serve." },
  ],
};

Deno.test("deterministic linker connects explicit ingredient mentions", () => {
  const flow: RecipeFlow | null = createDeterministicIngredientFlow(input);

  assertEquals(flow?.derivation, "enriched");
  assertDeepEquals(
    flow?.nodes.map((node): readonly string[] => node.ingredientIds),
    [
      ["ingredient:0"],
      ["ingredient:1"],
    ],
  );
});

Deno.test("model output is bounded to known IDs and confidence threshold", () => {
  const flow: RecipeFlow | null = parseIngredientLinkOutput({
    links: [
      {
        stepId: "step:0",
        ingredientIds: ["ingredient:0", "unknown"],
        confidence: 0.95,
      },
      {
        stepId: "step:1",
        ingredientIds: ["ingredient:1"],
        confidence: 0.2,
      },
    ],
  }, input);

  assertDeepEquals(flow?.nodes[0]?.ingredientIds, ["ingredient:0"]);
  assertDeepEquals(flow?.nodes[1]?.ingredientIds, []);
});

Deno.test("merging preserves deterministic links and fills missing step links", () => {
  const deterministic: RecipeFlow = {
    derivation: "enriched",
    nodes: [
      { id: "node:step:0", stepId: "step:0", ingredientIds: ["ingredient:0"] },
      { id: "node:step:1", stepId: "step:1", ingredientIds: [] },
    ],
    edges: [{
      id: "edge:step:0:step:1",
      fromNodeId: "node:step:0",
      toNodeId: "node:step:1",
      kind: "sequence",
    }],
  };
  const model: RecipeFlow = {
    derivation: "enriched",
    nodes: [
      { id: "node:step:0", stepId: "step:0", ingredientIds: ["ingredient:0"] },
      { id: "node:step:1", stepId: "step:1", ingredientIds: ["ingredient:1"] },
    ],
    edges: [{
      id: "edge:step:0:step:1",
      fromNodeId: "node:step:0",
      toNodeId: "node:step:1",
      kind: "sequence",
    }],
  };

  const merged: RecipeFlow | null = mergeIngredientFlows(
    deterministic,
    model,
    input.steps,
  );
  assertDeepEquals(
    merged?.nodes.map((node): readonly string[] => node.ingredientIds),
    [
      ["ingredient:0"],
      ["ingredient:1"],
    ],
  );
});

Deno.test("OpenRouter linker returns an enriched flow from known IDs", async () => {
  const transport: OpenRouterTransport = {
    fetch(_input: string, _init: RequestInit): Promise<Response> {
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{
              message: {
                content: JSON.stringify({
                  links: [
                    {
                      stepId: "step:0",
                      ingredientIds: ["ingredient:0"],
                      confidence: 0.98,
                    },
                    {
                      stepId: "step:1",
                      ingredientIds: ["ingredient:1"],
                      confidence: 0.92,
                    },
                  ],
                }),
              },
            }],
          }),
          { status: 200 },
        ),
      );
    },
  };
  const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
    api_key: "test-key",
    model: "test-model",
    timeout_ms: 100,
    transport,
  });

  const flow: RecipeFlow | null = await normalizer.link(input);
  assertEquals(flow?.derivation, "enriched");
  assertDeepEquals(flow?.nodes[1]?.ingredientIds, ["ingredient:1"]);
});
