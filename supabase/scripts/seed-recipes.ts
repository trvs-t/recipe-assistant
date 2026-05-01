import { createClient, SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

// Environment variable names
const ENV_SUPABASE_URL = "SUPABASE_URL";
const ENV_SERVICE_ROLE_KEY = "SUPABASE_SERVICE_ROLE_KEY";
const ENV_OPENROUTER_KEY = "OPENROUTER_API_KEY";
const ENV_ENVIRONMENT = "ENVIRONMENT";

// Local Supabase defaults (for `supabase start`)
const LOCAL_SUPABASE_URL = "http://127.0.0.1:54321";
const LOCAL_SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

// Dev user credentials (from project context)
const DEV_EMAIL = "dev@example.com";
const DEV_PASSWORD = "devpassword123";

// Polling configuration
const DEFAULT_MAX_ATTEMPTS = 40;
const DEFAULT_DELAY_MS = 3000;

// Recipe status union type matching the database schema
interface RecipeStatus {
  status: "pending" | "parsing" | "parsed" | "draft" | "error";
  parse_error?: string;
}

// Input for seeding a recipe
interface SeedInput {
  type: "url" | "text";
  content: string;
  label: string;
  cuisine: string;
}

// Response from the import-recipe edge function
interface ImportRecipeResponse {
  success: boolean;
  recipeId?: string;
  error?: string;
  validationError?: string;
}

// Summary of seeding results
interface SeedSummary {
  parsed: number;
  draft: number;
  error: number;
  timedOut: number;
}

// Logger utility with emojis
function log(message: string, level: "info" | "success" | "warning" | "error" = "info"): void {
  const emojis: Record<typeof level, string> = {
    info: "ℹ️",
    success: "✅",
    warning: "⚠️",
    error: "❌",
  };
  console.log(`${emojis[level]} ${message}`);
}

// SEED_INPUTS: 11 inputs for the seed script
// 5 URL recipes (from task2-urls.md)
// 1 Non-recipe URL (Wikipedia - will get draft status)
// 4 Text recipes (from task3-recipes.md)
// 1 Garbage text (will get error status)
const SEED_INPUTS: SeedInput[] = [
  // URL Recipes (5) - should produce 'parsed' status
  {
    type: "url",
    content: "https://www.bbcgoodfood.com/recipes/carne-asada-tacos",
    label: "BBC Good Food Carne Asada Tacos",
    cuisine: "Mexican",
  },
  {
    type: "url",
    content: "https://www.budgetbytes.com/dal-nirvana/",
    label: "Budget Bytes Dal Nirvana",
    cuisine: "Indian",
  },
  {
    type: "url",
    content: "https://cookieandkate.com/pumpkin-fettuccine-alfredo/",
    label: "Cookie and Kate Pumpkin Fettuccine Alfredo",
    cuisine: "Italian",
  },
  {
    type: "url",
    content: "https://www.loveandlemons.com/cacio-e-pepe/",
    label: "Love and Lemons Cacio e Pepe",
    cuisine: "Italian",
  },
  {
    type: "url",
    content: "https://thewoksoflife.com/thai-basil-chicken-pad-krapow/",
    label: "The Woks of Life Thai Basil Chicken",
    cuisine: "Thai",
  },
  // Non-recipe URL (1) - should produce 'draft' status
  {
    type: "url",
    content: "https://en.wikipedia.org/wiki/Cooking",
    label: "Wikipedia Cooking Article",
    cuisine: "N/A",
  },
  // Text Recipes (4) - should produce 'parsed' status
  {
    type: "text",
    content: `Start your morning right with these incredibly fluffy buttermilk pancakes that are crispy on the edges and tender in the middle. Perfect for a weekend brunch or a special weekday treat.

Ingredients:
- 2 cups all-purpose flour
- 2 tablespoons sugar
- 2 teaspoons baking powder
- 1/2 teaspoon baking soda
- 1/2 teaspoon salt
- 2 cups buttermilk
- 2 large eggs
- 3 tablespoons melted butter
- 1 teaspoon vanilla extract
- Butter for cooking

Instructions:
1. In a large bowl, whisk together the flour, sugar, baking powder, baking soda, and salt.
2. In a separate bowl, beat the eggs and mix in the buttermilk, melted butter, and vanilla.
3. Pour the wet ingredients into the dry ingredients and stir until just combined. Do not overmix; lumps are okay.
4. Heat a griddle or large skillet over medium heat and grease with butter.
5. Pour 1/4 cup batter for each pancake onto the hot griddle.
6. Cook until bubbles form on the surface, about 2-3 minutes, then flip and cook another 1-2 minutes until golden brown.
7. Serve warm with maple syrup and fresh berries.`,
    label: "Fluffy Buttermilk Pancakes",
    cuisine: "American",
  },
  {
    type: "text",
    content: `This quick and easy garlic butter pasta is the ultimate weeknight dinner solution. Ready in just 15 minutes, it's perfect for busy evenings when you want something delicious without spending hours in the kitchen. This vegetarian recipe is packed with flavor from fresh garlic, herbs, and plenty of parmesan cheese.

Ingredients:
- 12 oz spaghetti or linguine
- 6 tablespoons unsalted butter
- 8 cloves garlic, minced
- 1/2 teaspoon red pepper flakes
- 1/2 cup fresh parsley, chopped
- 1 cup freshly grated parmesan cheese
- Salt and black pepper to taste
- Extra virgin olive oil for drizzling

Instructions:
1. Bring a large pot of salted water to boil and cook pasta according to package directions until al dente.
2. While pasta cooks, melt butter in a large skillet over medium heat.
3. Add minced garlic and red pepper flakes, sauté for 1-2 minutes until fragrant but not browned.
4. Reserve 1 cup of pasta water, then drain the pasta.
5. Add drained pasta to the skillet with the garlic butter sauce.
6. Toss well, adding reserved pasta water a little at a time to create a silky sauce.
7. Stir in half the parsley and parmesan cheese.
8. Season with salt and pepper to taste.
9. Serve immediately, topped with remaining parmesan and parsley, drizzled with olive oil.`,
    label: "15-Minute Garlic Butter Pasta",
    cuisine: "Italian",
  },
  {
    type: "text",
    content: `Indulge in this elegant French dessert featuring rich vanilla custard beneath a perfectly caramelized sugar crust. This gluten-free dessert is surprisingly simple to make at home and always impresses guests. The contrast between the creamy custard and the crackling caramelized top is pure perfection.

Ingredients:
- 2 cups heavy cream
- 1 vanilla bean, split and scraped (or 1 teaspoon vanilla extract)
- 5 large egg yolks
- 1/2 cup granulated sugar, plus more for caramelizing
- Pinch of salt
- Hot water for the bain-marie

Instructions:
1. Preheat oven to 325°F (165°C).
2. In a saucepan, heat the cream with the vanilla bean and scraped seeds until just simmering. Remove from heat and let steep for 15 minutes. Remove vanilla bean.
3. In a bowl, whisk together egg yolks, 1/2 cup sugar, and salt until pale and thick.
4. Slowly pour the warm cream into the egg mixture, whisking constantly to temper the eggs.
5. Strain the custard through a fine mesh sieve into a pouring pitcher.
6. Divide the custard among 4-6 ramekins placed in a baking dish.
7. Pour hot water into the baking dish until it reaches halfway up the sides of the ramekins.
8. Bake for 35-40 minutes until the edges are set but centers still jiggle slightly.
9. Remove from water bath and cool to room temperature, then refrigerate for at least 4 hours or overnight.
10. Before serving, sprinkle 1 teaspoon sugar evenly over each custard.
11. Use a kitchen torch to caramelize the sugar until golden and bubbling. Let cool for 1 minute to harden.
12. Serve immediately and enjoy the satisfying crack of the caramelized top.`,
    label: "Classic French Crème Brûlée",
    cuisine: "French",
  },
  {
    type: "text",
    content: `This hearty chickpea curry is a beloved Indian vegetarian dish that's both comforting and nutritious. Packed with protein-rich chickpeas and aromatic spices, this vegan recipe is perfect for a satisfying dinner. Serve it with rice or warm naan bread for a complete meal that will transport you to the streets of Mumbai.

Ingredients:
- 2 cans (15 oz each) chickpeas, drained and rinsed
- 2 tablespoons vegetable oil
- 1 large onion, finely diced
- 3 cloves garlic, minced
- 1 tablespoon fresh ginger, grated
- 1 can (14 oz) diced tomatoes
- 1 teaspoon ground cumin
- 1 teaspoon ground coriander
- 1/2 teaspoon turmeric powder
- 1/2 teaspoon garam masala
- 1/4 teaspoon cayenne pepper (adjust to taste)
- 1 cup coconut milk
- 1/2 cup fresh cilantro, chopped
- Juice of 1 lemon
- Salt to taste
- Cooked basmati rice for serving

Instructions:
1. Heat oil in a large pot or deep skillet over medium heat.
2. Add diced onion and sauté for 5-7 minutes until soft and golden.
3. Add minced garlic and grated ginger, cook for 1 minute until fragrant.
4. Stir in cumin, coriander, turmeric, garam masala, and cayenne. Toast spices for 30 seconds.
5. Add diced tomatoes with their juices and simmer for 5 minutes, stirring occasionally.
6. Add chickpeas and coconut milk. Stir well to combine.
7. Bring to a gentle simmer and cook uncovered for 15-20 minutes, stirring occasionally.
8. Use the back of a spoon to mash some chickpeas against the side of the pot to thicken the curry.
9. Season with salt and lemon juice to taste.
10. Stir in half the fresh cilantro.
11. Serve hot over basmati rice, garnished with remaining cilantro.`,
    label: "Creamy Chickpea Curry",
    cuisine: "Indian",
  },
  // Garbage Text (1) - should produce 'error' status
  {
    type: "text",
    content: `Chicken beef pork onion garlic tomato pasta rice potato carrot spinach eggs milk cheese butter bread salt pepper sugar flour oil water fire cook eat food yummy delicious tasty meal dinner lunch breakfast snack appetizer main course dessert sweet sour bitter salty umami flavor texture color smell sound temperature time weight volume quantity amount number unit measurement ingredient component element substance material matter object thing item stuff material goods commodity product article merchandise ware item piece unit portion serving helping ration share allocation allotment allowance quota dose measure amount quantity magnitude size extent degree level grade rank class category type kind sort variety species breed strain stock family genus order phylum kingdom domain realm sphere field area region zone territory sector section division part portion piece fragment chunk block lump mass bulk body volume substance material stuff matter content essence nature character quality property attribute feature trait aspect element component constituent ingredient part piece member unit item article object thing entity being existence reality actuality fact truth validity authenticity genuineness legitimacy legality lawfulness rightfulness rightness correctness accuracy precision exactness fidelity faithfulness loyalty allegiance devotion dedication commitment attachment fondness liking love affection tenderness warmth passion desire longing yearning craving hunger thirst appetite taste preference inclination tendency propensity proclivity predisposition leaning bent bias prejudice predilection partiality favoritism discrimination distinction differentiation separation division partition segregation isolation seclusion solitude loneliness aloneness privacy confidentiality secrecy concealment hiding cover disguise camouflage mask veil screen shield protection shelter refuge sanctuary haven harbor port dock pier jetty wharf quay landing berth mooring anchorage haven safety security protection shelter refuge sanctuary haven port dock pier jetty wharf quay landing berth mooring anchorage harbor`,
    label: "Garbage Text Recipe",
    cuisine: "Unknown",
  },
];

function validateEnvVars(): { supabaseUrl: string; serviceRoleKey: string; openRouterKey: string } {
  if (Deno.env.get(ENV_ENVIRONMENT) === "local") {
    log("ℹ️ ENVIRONMENT=local detected, loading .env file...", "info");
    try {
      const envFile = Deno.readTextFileSync(".env");
      for (const line of envFile.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIndex = trimmed.indexOf("=");
        if (eqIndex < 0) continue;
        const key = trimmed.slice(0, eqIndex).trim();
        const value = trimmed.slice(eqIndex + 1).trim();
        if (value && !Deno.env.get(key)) {
          Deno.env.set(key, value);
        }
      }
      log("ℹ️ .env loaded", "info");
    } catch {
      log("⚠️ No .env file found, using defaults", "warning");
    }
  }

  const supabaseUrl = Deno.env.get(ENV_SUPABASE_URL) ?? LOCAL_SUPABASE_URL;
  const serviceRoleKey = Deno.env.get(ENV_SERVICE_ROLE_KEY) ?? LOCAL_SERVICE_ROLE_KEY;
  const openRouterKey = Deno.env.get(ENV_OPENROUTER_KEY);

  if (!openRouterKey) {
    throw new Error(
      `Missing required environment variable: ${ENV_OPENROUTER_KEY}\n` +
        `Get your key from https://openrouter.ai/keys and set it:\n` +
        `  export ${ENV_OPENROUTER_KEY}=sk-or-v1-...`
    );
  }

  return {
    supabaseUrl,
    serviceRoleKey,
    openRouterKey,
  };
}

// Create Supabase client with service role key (bypasses RLS)
function createSupabaseClient(supabaseUrl: string, serviceRoleKey: string): SupabaseClient {
  return createClient(supabaseUrl, serviceRoleKey);
}

// Authenticate as dev user
async function authenticateDevUser(client: SupabaseClient): Promise<string> {
  log("🔑 Authenticating as dev@example.com...", "info");

  const { data, error } = await client.auth.signInWithPassword({
    email: DEV_EMAIL,
    password: DEV_PASSWORD,
  });

  if (error) {
    throw new Error(`Authentication failed: ${error.message}`);
  }

  if (!data.session?.access_token) {
    throw new Error("Authentication succeeded but no access token returned");
  }

  log("🔑 Authenticated as dev@example.com", "success");
  return data.session.access_token;
}

async function clearAllRecipeData(client: SupabaseClient, _userId: string): Promise<void> {
  log("🗑️ Clearing all recipe data...", "info");

  const { data: recipes, error: recipesError } = await client
    .from("recipes")
    .select("id");

  if (recipesError) {
    log(`⚠️ Failed to fetch recipes: ${recipesError.message}`, "warning");
  }

  const recipeIds = recipes?.map((r) => r.id) ?? [];

  if (recipeIds.length === 0) {
    log("🗑️ No recipes to clear", "info");
    return;
  }

  const { count: stepsCount, error: stepsError } = await client
    .from("steps")
    .delete()
    .in("recipe_id", recipeIds);

  if (stepsError) {
    log(`⚠️ Failed to clear steps: ${stepsError.message}`, "warning");
  } else {
    log(`🗑️ Cleared ${stepsCount ?? 0} steps`, "success");
  }

  const { count: ingredientsCount, error: ingredientsError } = await client
    .from("ingredients")
    .delete()
    .in("recipe_id", recipeIds);

  if (ingredientsError) {
    log(`⚠️ Failed to clear ingredients: ${ingredientsError.message}`, "warning");
  } else {
    log(`🗑️ Cleared ${ingredientsCount ?? 0} ingredients`, "success");
  }

  const { count: recipesCount, error: deleteRecipesError } = await client
    .from("recipes")
    .delete()
    .in("id", recipeIds);

  if (deleteRecipesError) {
    log(`⚠️ Failed to clear recipes: ${deleteRecipesError.message}`, "warning");
  } else {
    log(`🗑️ Cleared ${recipesCount ?? 0} recipes`, "success");
  }
}

// Post to import-recipe edge function
async function postToImportRecipe(
  supabaseUrl: string,
  input: SeedInput,
  accessToken: string
): Promise<ImportRecipeResponse> {
  const endpoint = `${supabaseUrl}/functions/v1/import-recipe`;

  const body: Record<string, string> = {};
  if (input.type === "url") {
    body.url = input.content;
  } else {
    body.text = input.content;
  }

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (response.status === 202) {
    const data = await response.json();
    return {
      success: true,
      recipeId: data.recipe_id,
    };
  }

  if (response.status === 400) {
    const data = await response.json();
    return {
      success: false,
      error: data.error || data.validation_error || "Validation error",
      validationError: data.validation_error,
    };
  }

  if (response.status === 401) {
    throw new Error("Authentication failed: Invalid or expired token");
  }

  if (response.status === 500) {
    const data = await response.json();
    return {
      success: false,
      error: data.error || "Server error",
    };
  }

  // Unknown status code
  return {
    success: false,
    error: `Unexpected response: ${response.status}`,
  };
}

// Poll recipe status until resolved (terminal status) or timeout
async function pollRecipeStatus(
  client: SupabaseClient,
  recipeId: string,
  label: string,
  maxAttempts: number = DEFAULT_MAX_ATTEMPTS,
  delayMs: number = DEFAULT_DELAY_MS
): Promise<{ status: string; timedOut: boolean }> {
  let attempts = 0;

  while (attempts < maxAttempts) {
    attempts++;

    const { data, error } = await client
      .from("recipes")
      .select("status, parse_error")
      .eq("id", recipeId)
      .single();

    if (error) {
      log(`⚠️ Error polling recipe ${recipeId}: ${error.message}`, "warning");
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      continue;
    }

    const currentStatus = data.status as string;

    // Terminal statuses
    if (currentStatus === "parsed" || currentStatus === "draft" || currentStatus === "error") {
      log(`✅ ${label} → ${currentStatus}${data.parse_error ? ` (${data.parse_error})` : ""}`, "success");
      return { status: currentStatus, timedOut: false };
    }

    // Non-terminal: pending or parsing
    if (attempts % 10 === 0) {
      log(`⏳ ${label}: ${currentStatus} (attempt ${attempts}/${maxAttempts})`, "info");
    }

    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  // Timeout
  log(`⏱️ ${label} timed out after ${maxAttempts} attempts`, "warning");
  return { status: "timeout", timedOut: true };
}

// Main seed function
async function seed(): Promise<void> {
  log("Starting recipe seed process...", "info");

  let supabaseUrl: string;

  try {
    // Validate environment
    const env = validateEnvVars();
    supabaseUrl = env.supabaseUrl;
    log("Environment variables validated", "success");

    // Create Supabase client with service role
    const client = createSupabaseClient(env.supabaseUrl, env.serviceRoleKey);
    log("Supabase client created with service role", "success");

    // Clear all existing recipe data
    await clearAllRecipeData(client, "00000000-0000-0000-0000-000000000001");

    // Authenticate dev user
    const accessToken = await authenticateDevUser(client);

    // Process each input sequentially
    const summary: SeedSummary = {
      parsed: 0,
      draft: 0,
      error: 0,
      timedOut: 0,
    };

    for (const input of SEED_INPUTS) {
      log(`📤 Submitting: ${input.label} (${input.type})`, "info");

      const response = await postToImportRecipe(supabaseUrl, input, accessToken);

      if (!response.success) {
        log(`❌ ${input.label} failed to submit: ${response.error}`, "error");
        summary.error++;
        continue;
      }

      if (!response.recipeId) {
        log(`❌ ${input.label}: No recipe ID returned`, "error");
        summary.error++;
        continue;
      }

      log(`📤 Submitted: ${input.label} → recipe_id: ${response.recipeId}`, "success");

      // Poll for terminal status
      const result = await pollRecipeStatus(client, response.recipeId, input.label);

      if (result.timedOut) {
        summary.timedOut++;
      } else if (result.status === "parsed") {
        summary.parsed++;
      } else if (result.status === "draft") {
        summary.draft++;
      } else if (result.status === "error") {
        summary.error++;
      }
    }

    // Print summary
    log(
      `📊 Results: ${summary.parsed} parsed, ${summary.draft} draft, ${summary.error} error, ${summary.timedOut} timed out`,
      "info"
    );

    // Exit code: 0 if at least 1 parsed, 1 if all failed
    if (summary.parsed === 0 && summary.draft === 0 && summary.error === 0 && summary.timedOut === 0) {
      log("No recipes were processed", "error");
      Deno.exit(1);
    } else if (summary.parsed === 0) {
      log("WARNING: No recipes reached parsed status", "warning");
    }

    log("Seed process completed successfully", "success");
  } catch (error) {
    log(`Seed process failed: ${error instanceof Error ? error.message : String(error)}`, "error");
    throw error;
  }
}

// Run seed if this file is executed directly
if (import.meta.main) {
  seed()
    .then(() => {
      Deno.exit(0);
    })
    .catch(() => {
      Deno.exit(1);
    });
}

export {
  authenticateDevUser,
  clearAllRecipeData,
  createSupabaseClient,
  log,
  pollRecipeStatus,
  postToImportRecipe,
  seed,
  SEED_INPUTS,
  validateEnvVars,
};
export type { ImportRecipeResponse, RecipeStatus, SeedInput, SeedSummary };