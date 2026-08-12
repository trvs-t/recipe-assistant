import { assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";

import { parseIngredient } from "./ingredient-parser.ts";

Deno.test("parseIngredient separates a decimal quantity, unit, and name", () => {
  assertEquals(parseIngredient("2.5 cups bread flour"), {
    quantity: 2.5,
    unit: "cups",
    name: "bread flour",
    original_text: "2.5 cups bread flour",
  });
});

Deno.test("parseIngredient supports mixed fractions", () => {
  assertEquals(parseIngredient("1 1/2 tablespoons olive oil"), {
    quantity: 1.5,
    unit: "tablespoons",
    name: "olive oil",
    original_text: "1 1/2 tablespoons olive oil",
  });
});

Deno.test("parseIngredient averages a quantity range", () => {
  assertEquals(parseIngredient("1-2 cloves garlic"), {
    quantity: 1.5,
    unit: "cloves",
    name: "garlic",
    original_text: "1-2 cloves garlic",
  });
});

Deno.test("parseIngredient keeps an ingredient name when no unit is present", () => {
  assertEquals(parseIngredient("2 apples"), {
    quantity: 2,
    unit: null,
    name: "apples",
    original_text: "2 apples",
  });
});

Deno.test("parseIngredient preserves unstructured ingredient text", () => {
  assertEquals(parseIngredient("salt to taste"), {
    quantity: null,
    unit: null,
    name: "salt to taste",
    original_text: "salt to taste",
  });
});
