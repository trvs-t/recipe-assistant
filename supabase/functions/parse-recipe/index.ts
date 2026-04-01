import { serve } from '@std/http'
import { corsHeaders } from '../_shared/types.ts'
import { createOpenRouter } from '@openrouter/ai-sdk-provider'
import { generateText, Output } from 'ai'
import { z } from 'zod'

interface ParseRecipeRequest {
  recipe_id: string
  url: string
}

interface ParseRecipeResponse {
  success: boolean
  parser: 'ai'
  data?: {
    title: string
    ingredients: string[]
    steps: string[]
    servings?: number
    prep_time?: number
    cook_time?: number
  }
  error?: string
  code?: 'FETCH_FAILED' | 'PARSE_FAILED' | 'RATE_LIMIT' | 'INVALID_URL'
  retryable?: boolean
}

const RecipeOutputSchema = Output.object({
  schema: z.object({
    title: z.string(),
    ingredients: z.array(z.string()),
    steps: z.array(z.string()),
    servings: z.number().optional(),
    prep_time_minutes: z.number().optional(),
    cook_time_minutes: z.number().optional(),
  }),
})

export function validateUrl(urlString: string): URL | null {
  try {
    const url = new URL(urlString)
    if (!['http:', 'https:'].includes(url.protocol)) {
      return null
    }
    return url
  } catch {
    return null
  }
}

export function sanitizeHtml(html: string): string {
  // Remove script, style, and other dangerous tags
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
}

export function pruneDom(html: string): string {
  let content = html

  // Remove common non-recipe elements
  content = content.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
  content = content.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
  content = content.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
  content = content.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')

  // Remove common ad/content surrounding elements
  content = content.replace(/<div\b[^>]*(?:class|id)[^>]*=["'][^"']*(?:sidebar|advertisement|ad-|ads-|comment|social|share|related|recommended)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
  content = content.replace(/<div\b[^>]*(?:class|id)[^>]*=["'][^"']*(?:banner|promo|promotion)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')

  // Remove empty divs and spans
  content = content.replace(/<div[^>]*>\s*<\/div>/g, '')
  content = content.replace(/<span[^>]*>\s*<\/span>/g, '')

  // Remove inline styles and classes to reduce tokens
  content = content.replace(/\s+class=["'][^"']*["']/g, '')
  content = content.replace(/\s+id=["'][^"']*["']/g, '')
  content = content.replace(/\s+style=["'][^"']*["']/g, '')

  // Remove data attributes
  content = content.replace(/\s+data-[a-z-]+=["'][^"']*["']/gi, '')

  // Collapse whitespace to reduce tokens
  content = content.replace(/\s+/g, ' ').trim()

  return content
}

export function extractRecipeContent(html: string): string {
  // First, sanitize the HTML
  let content = sanitizeHtml(html)

  // Try to find JSON-LD structured data first (most reliable)
  const jsonLdMatch = content.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1])
      const recipe = findRecipeInJsonLd(jsonLd)
      if (recipe) {
        return JSON.stringify(recipe)
      }
    } catch {
      // Continue with HTML extraction
    }
  }

  // Prune DOM to reduce size
  content = pruneDom(content)

  // Try to find main recipe container by common selectors
  // Look for recipe-specific article/main elements
  const articleMatch = content.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i)
  if (articleMatch && articleMatch[1].length > 500) {
    content = articleMatch[1]
  }

  // Look for common recipe container classes
  const recipeContainerMatch = content.match(/<div[^>]*(?:class|id)[^>]*=["'][^"']*(?:recipe|instructions|ingredients|steps| directions)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  if (recipeContainerMatch && recipeContainerMatch[1].length > 500) {
    content = recipeContainerMatch[1]
  }

  // Limit content size to prevent token overflow (roughly 15k chars after pruning)
  if (content.length > 15000) {
    content = content.substring(0, 15000)
  }

  return content
}

export function findRecipeInJsonLd(data: unknown): unknown | null {
  if (!data) return null

  if (Array.isArray(data)) {
    for (const item of data) {
      const found = findRecipeInJsonLd(item)
      if (found) return found
    }
    return null
  }

  if (typeof data === 'object') {
    const obj = data as Record<string, unknown>
    
    // Check @type for Recipe
    const type = obj['@type']
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
      return obj
    }

    // Recursively check in @graph
    if (obj['@graph']) {
      return findRecipeInJsonLd(obj['@graph'])
    }
  }

  return null
}

/**
 * Parse recipe content using OpenRouter with Vercel AI SDK.
 * Uses google/gemma-3-4b-it:free model (fast, capable, no cost).
 */
async function parseWithOpenRouter(content: string): Promise<{
  title: string
  ingredients: string[]
  steps: string[]
  servings?: number
  prep_time_minutes?: number
  cook_time_minutes?: number
}> {
  const apiKey = Deno.env.get('OPENROUTER_API_KEY')
  if (!apiKey) {
    throw new Error('OPENROUTER_API_KEY not configured')
  }

  const openrouter = createOpenRouter({ apiKey })

  const { output } = await generateText({
    model: openrouter.chat('google/gemma-3-4b-it:free'),
    maxOutputTokens: 2048,
    system: `You are a recipe parsing assistant. Extract structured recipe data from the provided content.
Return a JSON object with the following schema:
{
  "title": "Recipe name",
  "ingredients": ["list of ingredient strings with quantities and units"],
  "steps": ["list of step instructions"],
  "servings": number (optional),
  "prep_time_minutes": number (optional),
  "cook_time_minutes": number (optional)
}

Only include fields that can be reasonably extracted. Ingredients should be complete strings with quantities and units. Steps should be complete instructions.`,
    prompt: `Extract the recipe from this content:\n\n${content}`,
    output: RecipeOutputSchema,
  })

  if (!output) {
    throw new Error('Failed to parse recipe: no output from model')
  }

  return output
}

serve(async (req): Promise<Response> => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  const result: ParseRecipeResponse = {
    success: false,
    parser: 'ai',
    retryable: false,
  }

  try {
    const body: ParseRecipeRequest = await req.json()

    // Validate URL
    const url = validateUrl(body.url)
    if (!url) {
      result.success = false
      result.code = 'INVALID_URL'
      result.error = 'Invalid or malformed URL'
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      })
    }

    // Fetch HTML content
    let html: string
    try {
      const response = await fetch(url.toString(), {
        headers: {
          'User-Agent': 'Mozilla/5.0 (compatible; RecipeAssistant/1.0; +https://example.com/bot)',
          'Accept': 'text/html,application/xhtml+xml',
        },
        signal: AbortSignal.timeout(15000), // 15 second timeout
      })

      if (!response.ok) {
        throw Object.assign(
          new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`),
          { code: 'FETCH_FAILED' }
        )
      }

      html = await response.text()
    } catch (error) {
      if ((error as Record<string, unknown>).code === 'ABORT_ERR') {
        result.code = 'FETCH_FAILED'
        result.error = 'Request timed out'
      } else {
        result.code = 'FETCH_FAILED'
        result.error = error instanceof Error ? error.message : 'Failed to fetch URL'
      }
      result.retryable = true
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 502,
      })
    }

    // Extract and prune recipe content
    const recipeContent = extractRecipeContent(html)

    if (!recipeContent || recipeContent.length < 100) {
      result.code = 'PARSE_FAILED'
      result.error = 'Could not extract recipe content from page'
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 422,
      })
    }

    // Call OpenRouter API to parse recipe
    let parseResult: {
      title: string
      ingredients: string[]
      steps: string[]
      servings?: number
      prep_time_minutes?: number
      cook_time_minutes?: number
    }
    try {
      parseResult = await parseWithOpenRouter(recipeContent)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      // Check for rate limiting (429)
      if (errorMessage.includes('429') || errorMessage.includes('rate limit')) {
        result.code = 'RATE_LIMIT'
        result.error = 'OpenRouter rate limit exceeded'
        result.retryable = true
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 429,
        })
      }

      result.code = 'PARSE_FAILED'
      result.error = `Failed to parse recipe: ${errorMessage}`
      // PARSE_FAILED is not retryable
      result.retryable = false
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Validate response
    if (!parseResult.title || !parseResult.ingredients || !parseResult.steps) {
      result.code = 'PARSE_FAILED'
      result.error = 'Incomplete recipe data from AI parser'
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Success
    result.success = true
    result.data = {
      title: parseResult.title,
      ingredients: parseResult.ingredients,
      steps: parseResult.steps,
      servings: parseResult.servings,
      prep_time: parseResult.prep_time_minutes,
      cook_time: parseResult.cook_time_minutes,
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })

  } catch (error) {
    result.success = false
    result.code = 'PARSE_FAILED'
    result.error = error instanceof Error ? error.message : 'Unknown error'
    result.retryable = false

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      status: 500,
    })
  }
})