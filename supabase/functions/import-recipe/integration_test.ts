import { configAsync } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts'
import { assertEquals, assertExists, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { resolve } from 'https://deno.land/std@0.168.0/path/mod.ts'

const envPath = resolve(Deno.cwd(), '..', '.env')
await configAsync({ export: true, path: envPath })

import { parseWithOpenRouter, hasRecipeJsonLd, hasRecipePatterns, extractRecipeContent } from './index.ts'

const BROWSER_HEADERS: Record<string, string> = {
  'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
  'Accept-Language': 'en-GB,en;q=0.9,en-US;q=0.8',
  'Accept-Encoding': 'gzip, deflate, br',
  'Sec-Fetch-Dest': 'document',
  'Sec-Fetch-Mode': 'navigate',
  'Sec-Fetch-Site': 'none',
  'Sec-Fetch-User': '?1',
  'Cache-Control': 'no-cache',
  'Pragma': 'no-cache',
  'Upgrade-Insecure-Requests': '1',
}

Deno.test({
  name: 'parseWithOpenRouter integration: parses simple recipe content',
  fn: async () => {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.log('Skipping: OPENROUTER_API_KEY not set')
      return
    }

    const recipeContent = `
    Chocolate Chip Cookies
    
    Ingredients:
    - 2 cups all-purpose flour
    - 1 cup butter, softened
    - 3/4 cup sugar
    - 2 eggs
    - 2 cups chocolate chips
    
    Instructions:
    1. Preheat oven to 375F
    2. Mix flour, butter, sugar, and eggs
    3. Fold in chocolate chips
    4. Drop spoonfuls onto baking sheet
    5. Bake for 10-12 minutes
    
    Serves: 24 cookies
    Prep time: 15 minutes
    Cook time: 12 minutes
    `

    const result = await parseWithOpenRouter(recipeContent)
    
    assertExists(result.title)
    assertStringIncludes(result.title.toLowerCase(), 'chocolate')
    assertEquals(Array.isArray(result.ingredients), true)
    assertEquals(Array.isArray(result.steps), true)
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'parseWithOpenRouter integration: parses real BBC Good Food recipe with BROWSER_HEADERS',
  fn: async () => {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.log('Skipping: OPENROUTER_API_KEY not set')
      return
    }

    const response = await fetch('https://www.bbcgoodfood.com/recipes/chicken-tikka-masala', {
      headers: BROWSER_HEADERS,
    })
    
    if (!response.ok) {
      console.log(`Skipping: Could not fetch BBC Good Food (${response.status})`)
      return
    }
    
    const html = await response.text()
    
    assertEquals(hasRecipeJsonLd(html), true, 'BBC Good Food should have JSON-LD recipe data')
    assertEquals(hasRecipePatterns(html), true, 'BBC Good Food should have recipe patterns')
    
    const content = extractRecipeContent(html)
    assertEquals(content.length > 0, true, 'Should extract recipe content')
    
    const result = await parseWithOpenRouter(content)
    
    assertExists(result.title)
    assertEquals(result.title.length > 0, true)
    assertEquals(Array.isArray(result.ingredients), true)
    assertEquals(result.ingredients.length > 0, true, 'Should have ingredients')
    assertEquals(Array.isArray(result.steps), true)
    assertEquals(result.steps.length > 0, true, 'Should have steps')
    
    console.log(`Parsed recipe: "${result.title}" with ${result.ingredients.length} ingredients and ${result.steps.length} steps`)
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'parseWithOpenRouter integration: handles natural language recipe request',
  fn: async () => {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.log('Skipping: OPENROUTER_API_KEY not set')
      return
    }

    const result = await parseWithOpenRouter('Give me a recipe for pasta with tomatoes, garlic, and basil.')
    
    assertExists(result.title)
    assertEquals(Array.isArray(result.ingredients), true)
    assertEquals(Array.isArray(result.steps), true)
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'BBC Good Food fetch with BROWSER_HEADERS returns 200',
  fn: async () => {
    const response = await fetch('https://www.bbcgoodfood.com/recipes/chicken-tikka-masala', {
      headers: BROWSER_HEADERS,
    })
    
    assertEquals(response.ok, true, `BBC Good Food should be accessible, got ${response.status}`)
    assertEquals(response.headers.get('content-type')?.includes('text/html'), true)
  },
  sanitizeOps: false,
  sanitizeResources: false,
})
