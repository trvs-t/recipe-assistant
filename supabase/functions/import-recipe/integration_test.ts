import { configAsync } from 'https://deno.land/x/dotenv@v3.2.2/mod.ts'
import { assertEquals, assertExists, assertStringIncludes } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { resolve } from 'https://deno.land/std@0.168.0/path/mod.ts'

const envPath = resolve(Deno.cwd(), '..', '.env')
await configAsync({ export: true, path: envPath })

import { parseWithOpenRouter } from './index.ts'

Deno.test({
  name: 'parseWithOpenRouter integration: parses simple recipe content',
  fn: async () => {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.log('Skipping: OPENROUTER_API_KEY not set')
      return
    }

    const recipeContent = `
    Chicken Tikka Masala
    
    Ingredients:
    - 500g chicken breast, cut into cubes
    - 1 cup yogurt
    - 2 tbsp tikka masala paste
    - 1 can coconut milk
    - 1 onion, diced
    - 2 cloves garlic, minced
    
    Instructions:
    1. Marinate chicken in yogurt and tikka paste for 2 hours
    2. Grill or bake chicken until cooked through
    3. Sauté onion and garlic, add coconut milk and simmer
    4. Add cooked chicken and simmer for 10 minutes
    5. Serve with rice or naan bread
    
    Serves: 4
    Prep time: 30 minutes
    Cook time: 25 minutes
    `

    const result = await parseWithOpenRouter(recipeContent)
    
    assertExists(result.title)
    assertStringIncludes(result.title.toLowerCase(), 'chicken')
    assertEquals(Array.isArray(result.ingredients), true)
    assertEquals(Array.isArray(result.steps), true)
  },
  sanitizeOps: false,
  sanitizeResources: false,
})

Deno.test({
  name: 'parseWithOpenRouter integration: parses real BBC Good Food recipe',
  fn: async () => {
    const apiKey = Deno.env.get('OPENROUTER_API_KEY')
    if (!apiKey) {
      console.log('Skipping: OPENROUTER_API_KEY not set')
      return
    }

    const response = await fetch('https://www.bbcgoodfood.com/recipes/chicken-tikka-masala', {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)' },
    })
    
    if (!response.ok) {
      console.log(`Skipping: Could not fetch BBC Good Food (${response.status})`)
      return
    }
    
    const html = await response.text()
    
    const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
    let content = ''
    
    if (jsonLdMatch) {
      try {
        const jsonLd = JSON.parse(jsonLdMatch[1])
        content = JSON.stringify(jsonLd)
      } catch {
        content = html.substring(0, 15000)
      }
    } else {
      content = html.substring(0, 15000)
    }

    const result = await parseWithOpenRouter(content)
    
    assertExists(result.title)
    assertEquals(result.title.length > 0, true)
    assertEquals(Array.isArray(result.ingredients), true)
    assertEquals(Array.isArray(result.steps), true)
    
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
