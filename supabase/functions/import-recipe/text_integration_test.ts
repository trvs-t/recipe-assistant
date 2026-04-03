import { configAsync } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts'
import { assertEquals, assertExists, assertStringIncludes, fail } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { resolve } from 'https://deno.land/std@0.168.0/path/mod.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const envPath = resolve(Deno.cwd(), '..', '.env')
await configAsync({ export: true, path: envPath })

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
const OPENROUTER_API_KEY = Deno.env.get('OPENROUTER_API_KEY')

function getSupabaseClient() {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set')
  }
  return createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)
}

async function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function waitForStatus(
  supabase: any,
  recipeId: string,
  targetStatuses: string[],
  timeoutMs: number = 120000
): Promise<string> {
  const startTime = Date.now()
  while (Date.now() - startTime < timeoutMs) {
    const { data } = await supabase
      .from('recipes')
      .select('status')
      .eq('id', recipeId)
      .single()
    
    if (data && targetStatuses.includes(data.status)) {
      return data.status
    }
    
    await sleep(2000)
  }
  throw new Error(`Timeout waiting for status: ${targetStatuses.join(' or ')}`)
}

async function cleanupRecipe(supabase: any, recipeId: string): Promise<void> {
  try {
    await supabase.from('steps').delete().eq('recipe_id', recipeId)
    await supabase.from('ingredients').delete().eq('recipe_id', recipeId)
    await supabase.from('recipes').delete().eq('id', recipeId)
  } catch (e) {
    console.log(`Cleanup warning for ${recipeId}:`, e)
  }
}

const SAMPLE_TEXT_RECIPE = `
Chocolate Chip Cookies

Ingredients:
- 2 1/4 cups all-purpose flour
- 1 cup butter, softened
- 3/4 cup sugar
- 3/4 cup brown sugar
- 2 large eggs
- 1 teaspoon vanilla extract
- 1 teaspoon baking soda
- 1/2 teaspoon salt
- 2 cups chocolate chips

Instructions:
1. Preheat oven to 375°F (190°C)
2. Cream together butter and sugars until fluffy
3. Beat in eggs and vanilla
4. Mix in flour, baking soda, and salt
5. Stir in chocolate chips
6. Drop rounded tablespoons onto baking sheets
7. Bake for 9-11 minutes until golden brown
8. Cool on baking sheet for 2 minutes

Servings: 48 cookies
Prep time: 15 minutes
Cook time: 11 minutes
`

const TOO_SHORT_TEXT = 'Only 30 chars here'

const TOO_LONG_TEXT = 'A'.repeat(10001)

const URL_DETECTED_TEXT = 'Check out this recipe: https://example.com/recipe for making pancakes'

Deno.test({
  name: 'text_integration: successfully imports text recipe end-to-end',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !OPENROUTER_API_KEY) {
      console.log('Skipping: Required env vars not set (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, OPENROUTER_API_KEY)')
      return
    }

    const supabase = getSupabaseClient()
    let recipeId: string | null = null
    
    try {
      const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer test-token',
        },
        body: JSON.stringify({
          text: SAMPLE_TEXT_RECIPE,
          source: 'text'
        }),
      })
      
      assertEquals(response.status, 202)
      
      const result = await response.json()
      assertExists(result.recipe_id)
      recipeId = result.recipe_id
      
      if (!recipeId) throw new Error('No recipe ID returned')
      const finalStatus = await waitForStatus(supabase, recipeId, ['parsed', 'error'])
      
      if (finalStatus === 'error') {
        const { data: errorData } = await supabase
          .from('recipes')
          .select('parse_error')
          .eq('id', recipeId)
          .single()
        fail(`Recipe parsing failed: ${errorData?.parse_error}`)
      }
      
      assertEquals(finalStatus, 'parsed')
      
      const { data: recipe } = await supabase
        .from('recipes')
        .select('*')
        .eq('id', recipeId)
        .single()
      
      assertExists(recipe)
      assertExists(recipe.title)
      assertStringIncludes(recipe.title.toLowerCase(), 'chocolate')
      assertEquals(recipe.source_text, SAMPLE_TEXT_RECIPE.trim())
      
      const { data: ingredients } = await supabase
        .from('ingredients')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('sort_order')
      
      assertExists(ingredients)
      assertEquals(ingredients.length > 0, true)
      
      const { data: steps } = await supabase
        .from('steps')
        .select('*')
        .eq('recipe_id', recipeId)
        .order('sort_order')
      
      assertExists(steps)
      assertEquals(steps.length > 0, true)
      
      console.log(`✅ Successfully imported text recipe: "${recipe.title}" with ${ingredients.length} ingredients and ${steps.length} steps`)
    } finally {
      if (recipeId) {
        await cleanupRecipe(supabase, recipeId)
      }
    }
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'text_integration: rejects text that is too short',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        text: TOO_SHORT_TEXT,
        source: 'text'
      }),
    })
    
    assertEquals(response.status, 400)
    
    const result = await response.json()
    assertEquals(result.validation_error, 'text_too_short')
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'text_integration: rejects text that is too long',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        text: TOO_LONG_TEXT,
        source: 'text'
      }),
    })
    
    assertEquals(response.status, 400)
    
    const result = await response.json()
    assertEquals(result.validation_error, 'text_too_long')
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'text_integration: rejects text containing URL',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        text: URL_DETECTED_TEXT,
        source: 'text'
      }),
    })
    
    assertEquals(response.status, 400)
    
    const result = await response.json()
    assertEquals(result.validation_error, 'url_detected_use_url_import')
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'text_integration: requires authorization header',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: SAMPLE_TEXT_RECIPE,
        source: 'text'
      }),
    })
    
    assertEquals(response.status, 401)
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'text_integration: requires text content',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        source: 'text'
      }),
    })
    
    assertEquals(response.status, 400)
    
    const result = await response.json()
    assertEquals(result.validation_error, 'text_required')
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'text_integration: cannot provide both url and text',
  fn: async () => {
    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.log('Skipping: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY not set')
      return
    }

    const response = await fetch(`${SUPABASE_URL}/functions/v1/import-recipe`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer test-token',
      },
      body: JSON.stringify({
        url: 'https://example.com/recipe',
        text: SAMPLE_TEXT_RECIPE,
        source: 'text'
      }),
    })
    
    assertEquals(response.status, 400)
    
    const result = await response.json()
    assertEquals(result.validation_error, 'url_and_text_mutually_exclusive')
  },
  sanitizeOps: false,
  sanitizeResources: false,
})
