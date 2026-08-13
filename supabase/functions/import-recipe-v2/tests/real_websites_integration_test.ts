import { normalizeRecipeDraft } from "../ai-normalizer.ts";
import { mapToCanonicalRecipe } from "../canonical-recipe.ts";
import { extractRecipeFromJsonLd } from "../json-ld-extractor.ts";
import {
  OPENROUTER_MODEL,
  OpenRouterNormalizer,
} from "../openrouter-normalizer.ts";
import { fetchSource } from "../source-fetcher.ts";
import { type NormalizedRecipe, type SourceDocument } from "../types.ts";
import { assert, assertEquals } from "./assertions.ts";

interface IRealWebsiteCase {
  readonly name: string;
  readonly url: string;
  readonly strategy: "schema_org" | "llm";
}

const realWebsites: readonly IRealWebsiteCase[] = [
  {
    name: "Recipes from Italy tiramisu",
    url: "https://www.recipesfromitaly.com/tiramisu-original-italian-recipe/",
    strategy: "schema_org",
  },
  {
    name: "Just One Cookbook miso salmon",
    url: "https://www.justonecookbook.com/miso-salmon/",
    strategy: "schema_org",
  },
  {
    name: "Good Food three-ingredient cookies",
    url: "https://www.bbcgoodfood.com/recipes/three-ingredient-cookies",
    strategy: "schema_org",
  },
  {
    name: "Cookie and Kate lentil soup",
    url: "https://cookieandkate.com/best-lentil-soup-recipe/",
    strategy: "schema_org",
  },
  {
    name: "RecipeTin Eats beef pasta",
    url: "https://www.recipetineats.com/one-pot-creamy-tomato-beef-pasta/",
    strategy: "schema_org",
  },
  {
    name: "Carnegie Mellon recipe archive garlic chicken",
    url: "https://www.cs.cmu.edu/~mjw/recipes/meat/chicken/garlic-chicken.html",
    strategy: "llm",
  },
];

Deno.test({
  name:
    "real recipe websites meet the 80 percent parse target with schema.org and LLM success",
  ignore: readEnvironment("RUN_REAL_WEBSITE_TESTS") !== "true",
  async fn(): Promise<void> {
    const apiKey: string = readEnvironment("OPENROUTER_API_KEY")?.trim() ?? "";
    assert(
      apiKey.length > 0,
      "OPENROUTER_API_KEY is required for the real-site corpus",
    );
    const normalizer: OpenRouterNormalizer = new OpenRouterNormalizer({
      api_key: apiKey,
      model: readEnvironment("OPENROUTER_MODEL")?.trim() ||
        OPENROUTER_MODEL,
      timeout_ms: 30_000,
    });
    let successes: number = 0;
    let schemaSuccesses: number = 0;
    let llmSuccesses: number = 0;
    const failures: string[] = [];

    for (const testCase of realWebsites) {
      try {
        const source: SourceDocument = await fetchSource(testCase.url);
        let recipe: NormalizedRecipe;
        if (testCase.strategy === "schema_org") {
          const extracted: NormalizedRecipe | null = extractRecipeFromJsonLd(
            source.body,
            testCase.url,
          );
          if (extracted === null) {
            throw new Error(
              `${testCase.name} did not expose usable Recipe JSON-LD`,
            );
          }
          recipe = extracted;
          schemaSuccesses += 1;
        } else {
          recipe = await normalizeAcrossDurableAttempts(
            normalizer,
            source,
            testCase.url,
          );
          llmSuccesses += 1;
        }
        const canonical = mapToCanonicalRecipe(recipe, testCase.url);
        assert(
          canonical.ingredients.length > 0,
          `${testCase.name} has no ingredients`,
        );
        assert(canonical.steps.length > 0, `${testCase.name} has no steps`);
        successes += 1;
      } catch (error) {
        failures.push(
          `${testCase.name}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    const rate: number = successes / realWebsites.length;
    assert(
      rate >= 0.8,
      `Real-site parse rate was ${Math.round(rate * 100)}%: ${
        failures.join(" | ")
      }`,
    );
    assert(
      schemaSuccesses > 0,
      `Schema.org parsing did not succeed: ${failures.join(" | ")}`,
    );
    assertEquals(
      llmSuccesses,
      1,
      `LLM parsing did not succeed: ${failures.join(" | ")}`,
    );
  },
});

function readEnvironment(name: string): string | undefined {
  try {
    return Deno.env.get(name);
  } catch {
    return undefined;
  }
}

async function normalizeAcrossDurableAttempts(
  normalizer: OpenRouterNormalizer,
  source: SourceDocument,
  sourceUrl: string,
): Promise<NormalizedRecipe> {
  let lastError: unknown = null;
  for (let attempt: number = 1; attempt <= 3; attempt += 1) {
    try {
      return normalizeRecipeDraft(
        await normalizer.normalize({
          source_url: sourceUrl,
          resolved_url: source.final_url,
          content: source.body,
          attempt,
        }),
        sourceUrl,
      );
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError instanceof Error
    ? lastError
    : new Error("OpenRouter exhausted the durable retry budget");
}
