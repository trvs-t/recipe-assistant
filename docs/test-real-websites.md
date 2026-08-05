# Real recipe website import corpus

Last verified: 2026-08-05 (Asia/Tokyo)

This corpus is the release gate for public recipe imports. It uses production
source fetching and semantic validation. The LLM case uses the pinned
`deepseek/deepseek-v4-flash` OpenRouter model. The LLM strategy is deliberately
forced for a small page without Recipe JSON-LD so the fallback is exercised
against actual website content.

| Website | URL | Strategy under test | Verified result |
| --- | --- | --- | --- |
| Recipes from Italy | https://www.recipesfromitaly.com/tiramisu-original-italian-recipe/ | Schema.org Recipe JSON-LD | Passed; non-empty title, ingredients, and steps |
| Just One Cookbook | https://www.justonecookbook.com/miso-salmon/ | Schema.org Recipe JSON-LD | Passed; non-empty title, ingredients, and steps |
| Good Food | https://www.bbcgoodfood.com/recipes/three-ingredient-cookies | Schema.org Recipe JSON-LD | Passed; non-empty title, ingredients, and steps |
| Cookie and Kate | https://cookieandkate.com/best-lentil-soup-recipe/ | Schema.org Recipe JSON-LD | Passed; non-empty title, ingredients, and steps |
| RecipeTin Eats | https://www.recipetineats.com/one-pot-creamy-tomato-beef-pasta/ | Schema.org Recipe JSON-LD | Passed; non-empty title, ingredients, and steps |
| Carnegie Mellon recipe archive | https://www.cs.cmu.edu/~mjw/recipes/meat/chicken/garlic-chicken.html | OpenRouter LLM fallback; no Recipe JSON-LD | Passed with `deepseek/deepseek-v4-flash`; schema-valid and semantically valid output |

## Result

- Successful parses: 6/6 (100%)
- Required threshold: at least 5/6 (80%)
- Schema.org success: yes (5 cases)
- LLM structured-output success: yes (1 forced-fallback case)
- Live corpus duration: 16 seconds
- Browser/database E2E for the LLM-only page: passed in 19.9 seconds using the
  local demo account. The persisted `Garlic Chicken` recipe had 16 ingredients,
  7 steps, 0 invalid ingredients, and 0 empty steps.
- Explicit zero quantities, empty ingredient lists, and empty step lists are
  rejected before persistence and by database constraints.

The initial `openrouter/free` evaluation was not reliable enough: one run
succeeded, but repeated runs exhausted the bounded retry budget on response-body
timeouts. After billing was enabled, the importer was pinned to
`deepseek/deepseek-v4-flash`. Reasoning is disabled for extraction, the response
budget is 4,096 tokens, and valid JSON wrapped in model commentary is recovered
before semantic validation. These settings produced the results above.

## Reproduce

From the repository root, with `OPENROUTER_API_KEY` present in the function env
file:

```bash
RUN_REAL_WEBSITE_TESTS=true deno test \
  --config supabase/functions/import-recipe-v2/deno.json \
  --env-file=supabase/functions/.env \
  --allow-env --allow-net --allow-read \
  supabase/functions/import-recipe-v2/tests/real_websites_integration_test.ts
```

To reproduce the complete LLM-only browser flow against local Supabase:

```bash
LOCAL_E2E_RECIPE_URL=https://www.cs.cmu.edu/~mjw/recipes/meat/chicken/garlic-chicken.html \
  pnpm web:test:e2e:local
```

The regular importer test suite leaves this live test ignored unless
`RUN_REAL_WEBSITE_TESTS=true`, avoiding accidental API use in routine unit-test
runs.

## Known source behavior

`https://www.allrecipes.com/recipe/21014/good-old-fashioned-pancakes/` returned
HTTP 403 to the importer user agent during this verification. That URL is not
counted as a valid parse failure: the source denied automated access before any
recipe body was available. The importer surfaces the source HTTP error and does
not persist a false-positive recipe.
