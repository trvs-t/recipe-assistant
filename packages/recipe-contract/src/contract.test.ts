import { describe, expect, it } from "vitest";

import { createLinearFlow, validateRecipeFlow } from "./flow";
import { isTerminalImportStatus } from "./lifecycle";
import { calculateScaleFactor, scaleIngredient } from "./scaling";
import { importedRecipeSchema, sourceUrlSchema } from "./schemas";

describe("recipe contract", () => {
  it("only accepts public-web URL protocols at the API boundary", () => {
    expect(sourceUrlSchema.safeParse("https://example.com/recipe").success)
      .toBe(
        true,
      );
    expect(sourceUrlSchema.safeParse("file:///etc/passwd").success).toBe(false);
  });

  it("scales numeric quantities and preserves unquantified ingredients", () => {
    const factor: number = calculateScaleFactor(4, 6);
    expect(factor).toBe(1.5);
    expect(
      scaleIngredient(
        {
          id: "flour",
          originalText: "2 cups flour",
          quantity: 2,
          unit: "cup",
          name: "flour",
          notes: null,
          measurements: [],
          sortOrder: 0,
        },
        factor,
      ).scaledQuantity,
    ).toBe(3);
  });

  it("scales every source-provided equivalent measurement and range", () => {
    const scaled = scaleIngredient({
      id: "butter",
      originalText: "228 g (1 cup or 2 sticks) butter",
      quantity: 228,
      unit: "g",
      name: "butter",
      notes: null,
      measurements: [
        { quantityMin: 228, quantityMax: 228, unit: "g", isPrimary: true, sortOrder: 0 },
        { quantityMin: 1, quantityMax: 1, unit: "cup", isPrimary: false, sortOrder: 1 },
        { quantityMin: 2, quantityMax: 2, unit: "sticks", isPrimary: false, sortOrder: 2 },
      ],
      sortOrder: 0,
    }, 2);

    expect(scaled.scaledMeasurements.map((measurement) => [
      measurement.quantityMin,
      measurement.quantityMax,
      measurement.unit,
    ])).toEqual([[456, 456, "g"], [2, 2, "cup"], [4, 4, "sticks"]]);
  });

  it("creates a deterministic linear graph fallback", () => {
    const flow = createLinearFlow([
      {
        id: "step-2",
        instruction: "Bake",
        timerDurationMinutes: 20,
        sortOrder: 1,
      },
      {
        id: "step-1",
        instruction: "Mix",
        timerDurationMinutes: null,
        sortOrder: 0,
      },
    ]);

    expect(flow.nodes.map((node) => node.stepId)).toEqual(["step-1", "step-2"]);
    expect(flow.edges).toHaveLength(1);
  });

  it("rejects cyclic enriched graphs", () => {
    const result = validateRecipeFlow(
      {
        derivation: "enriched",
        nodes: [
          { id: "a", stepId: "step-a", ingredientIds: [] },
          { id: "b", stepId: "step-b", ingredientIds: [] },
        ],
        edges: [
          { id: "a-b", fromNodeId: "a", toNodeId: "b", kind: "dependency" },
          { id: "b-a", fromNodeId: "b", toNodeId: "a", kind: "dependency" },
        ],
      },
      [
        {
          id: "step-a",
          instruction: "A",
          timerDurationMinutes: null,
          sortOrder: 0,
        },
        {
          id: "step-b",
          instruction: "B",
          timerDurationMinutes: null,
          sortOrder: 1,
        },
      ],
      [],
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Flow graph contains a cycle");
  });

  it("rejects a flow that omits a recipe step", () => {
    const result = validateRecipeFlow(
      { derivation: "enriched", nodes: [], edges: [] },
      [
        {
          id: "step-a",
          instruction: "A",
          timerDurationMinutes: null,
          sortOrder: 0,
        },
      ],
      [],
    );

    expect(result.valid).toBe(false);
    expect(result.errors).toContain("Flow graph omits step: step-a");
  });

  it("defines only completed, needs_input, and failed as terminal", () => {
    expect(isTerminalImportStatus("completed")).toBe(true);
    expect(isTerminalImportStatus("needs_input")).toBe(true);
    expect(isTerminalImportStatus("failed")).toBe(true);
    expect(isTerminalImportStatus("retry_wait")).toBe(false);
  });

  it("requires sourceUrl to remain available on an imported recipe", () => {
    const result = importedRecipeSchema.safeParse({
      id: "recipe-1",
      title: "Soup",
      sourceUrl: "https://example.com/soup",
      description: null,
      prepTimeMinutes: null,
      cookTimeMinutes: 20,
      totalTimeMinutes: 20,
      servings: 4,
      images: [],
      cuisineType: null,
      dietaryTags: [],
      status: "ready",
      parseConfidence: 0.9,
      ingredients: [],
      steps: [],
      flow: { derivation: "linear_fallback", nodes: [], edges: [] },
      createdAt: "2026-08-03T00:00:00.000Z",
      updatedAt: "2026-08-03T00:00:00.000Z",
    });

    expect(result.success).toBe(true);
  });
});
