import { extractRecipeFromJsonLd } from "../json-ld-extractor.ts";
import { assert, assertEquals } from "./assertions.ts";

Deno.test("extracts a complete Recipe from JSON-LD before AI fallback", () => {
  const jsonLd: string = JSON.stringify({
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "WebPage", name: "Recipe page" },
      {
        "@type": ["Thing", "Recipe"],
        name: "Miso Noodles",
        description: "<p>Fast and savory.</p>",
        recipeIngredient: ["2 cups noodles", "1/2 tbsp miso paste"],
        recipeInstructions: [
          { "@type": "HowToStep", text: "Boil the noodles." },
          { "@type": "HowToStep", text: "Stir in the miso." },
        ],
        recipeYield: "2 servings",
        prepTime: "PT10M",
        cookTime: "PT5M",
      },
    ],
  });
  const html: string = `<script TYPE='application/ld+json'>${jsonLd}</script>`;
  const recipe = extractRecipeFromJsonLd(html, "https://recipes.example/miso");

  assert(recipe !== null, "Expected a recipe to be extracted");
  if (recipe === null) {
    return;
  }
  assertEquals(recipe.title, "Miso Noodles");
  assertEquals(recipe.ingredients.length, 2);
  assertEquals(recipe.ingredients[0]?.quantity, 2);
  assertEquals(recipe.steps.length, 2);
  assertEquals(recipe.servings, 2);
  assertEquals(recipe.prep_time_minutes, 10);
  assertEquals(recipe.cook_time_minutes, 5);
  assertEquals(recipe.source_url, "https://recipes.example/miso");
});

Deno.test("ignores malformed and incomplete JSON-LD candidates", () => {
  const html: string = [
    '<script type="application/ld+json">not-json</script>',
    '<script type="application/ld+json">{"@type":"Recipe","name":"Only a title"}</script>',
  ].join("");
  const recipe = extractRecipeFromJsonLd(
    html,
    "https://recipes.example/unknown",
  );
  assertEquals(recipe, null);
});
