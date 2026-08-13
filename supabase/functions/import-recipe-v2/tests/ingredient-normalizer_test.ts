import {
  OpenRouterNormalizer,
  type OpenRouterTransport,
} from "../openrouter-normalizer.ts";
import { assertDeepEquals, assertEquals } from "./assertions.ts";

Deno.test("normalizes JSON-LD ingredient strings into ranges and equivalent measurements", async (): Promise<void> => {
  let requestBody: Record<string, unknown> | null = null;
  const output: Record<string, unknown> = {
    ingredients: [
      {
        id: "ingredient:0",
        originalText:
          "228 gms (1 cup or 2 sticks) Butter (Unsalted and softened)",
        quantity: 228,
        unit: "g",
        name: "Butter",
        notes: "Unsalted and softened",
        measurements: [
          { quantityMin: 228, quantityMax: 228, unit: "g", isPrimary: true },
          { quantityMin: 1, quantityMax: 1, unit: "cup", isPrimary: false },
          { quantityMin: 2, quantityMax: 2, unit: "sticks", isPrimary: false },
        ],
        sortOrder: 0,
      },
      {
        id: "ingredient:1",
        originalText: "3 to 4 cups (360g-480g) powdered sugar, sifted",
        quantity: 3,
        unit: "cups",
        name: "powdered sugar",
        notes: "sifted",
        measurements: [
          { quantityMin: 3, quantityMax: 4, unit: "cups", isPrimary: true },
          { quantityMin: 360, quantityMax: 480, unit: "g", isPrimary: false },
        ],
        sortOrder: 1,
      },
    ],
  };
  const transport: OpenRouterTransport = {
    fetch(_input: string, init: RequestInit): Promise<Response> {
      requestBody = JSON.parse(String(init.body)) as Record<string, unknown>;
      return Promise.resolve(
        new Response(
          JSON.stringify({
            choices: [{ message: { content: JSON.stringify(output) } }],
          }),
          { status: 200 },
        ),
      );
    },
  };
  const normalizer = new OpenRouterNormalizer({
    api_key: "test-key",
    model: "deepseek/deepseek-v4-flash",
    transport,
  });
  const sourceIngredients: readonly string[] = [
    "228 gms (1 cup or 2 sticks) Butter (Unsalted and softened)",
    "3 to 4 cups (360g-480g) powdered sugar, sifted",
  ];

  const ingredients = await normalizer.normalizeIngredients({
    ingredients: sourceIngredients,
  });

  assertEquals(requestBody?.["model"], "deepseek/deepseek-v4-flash");
  assertEquals(ingredients[0]?.id, "ingredient:0");
  assertEquals(ingredients[0]?.sort_order, 0);
  assertDeepEquals(ingredients[0]?.measurements, [
    { quantity_min: 228, quantity_max: 228, unit: "g", is_primary: true },
    { quantity_min: 1, quantity_max: 1, unit: "cup", is_primary: false },
    { quantity_min: 2, quantity_max: 2, unit: "sticks", is_primary: false },
  ]);
  assertDeepEquals(ingredients[1]?.measurements, [
    { quantity_min: 3, quantity_max: 4, unit: "cups", is_primary: true },
    { quantity_min: 360, quantity_max: 480, unit: "g", is_primary: false },
  ]);
  assertEquals(ingredients[1]?.quantity, 3);
});
