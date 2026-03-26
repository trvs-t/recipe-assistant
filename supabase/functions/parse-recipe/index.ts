import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { corsHeaders } from '../_shared/types.ts'

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

interface OpenAIResponse {
  title?: string
  ingredients?: string[]
  steps?: string[]
  servings?: number
  prep_time_minutes?: number
  cook_time_minutes?: number
}

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
 * Sleep for specified milliseconds.
 */
function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

/**
 * Calls OpenAI API with exponential backoff for retryable errors.
 */
async function callOpenAI(content: string, retries = 3): Promise<OpenAIResponse> {
  const apiKey = Deno.env.get('OPENAI_API_KEY')
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured')
  }

  let lastError: Error | null = null
  let baseDelay = 1000 // 1 second

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'gpt-4o-mini',
          max_tokens: 2048,
          messages: [
            {
              role: 'system',
              content: `You are a recipe parsing assistant. Extract structured recipe data from the provided content.
Return a JSON object with the following schema:
{
  "title": "Recipe name",
  "ingredients": ["list of ingredient strings"],
  "steps": ["list of step instructions"],
  "servings": number (optional),
  "prep_time_minutes": number (optional),
  "cook_time_minutes": number (optional)
}

Only include fields that can be reasonably extracted. Ingredients should be complete strings with quantities and units. Steps should be complete instructions.`
            },
            {
              role: 'user',
              content: `Extract the recipe from this content:\n\n${content}`
            }
          ],
          response_format: {
            type: 'json_schema',
            json_schema: {
              name: 'recipe',
              schema: {
                type: 'object',
                required: ['title', 'ingredients', 'steps'],
                properties: {
                  title: { type: 'string' },
                  ingredients: { 
                    type: 'array', 
                    items: { type: 'string' } 
                  },
                  steps: { 
                    type: 'array', 
                    items: { type: 'string' } 
                  },
                  servings: { type: 'number' },
                  prep_time_minutes: { type: 'number' },
                  cook_time_minutes: { type: 'number' }
                }
              }
            }
          }
        }),
      })

      if (response.status === 429) {
        // Rate limited - retry with exponential backoff
        if (attempt < retries) {
          const delay = baseDelay * Math.pow(2, attempt)
          await sleep(delay)
          baseDelay *= 2
          continue
        }
        throw Object.assign(new Error('Rate limit exceeded'), { code: 'RATE_LIMIT' })
      }

      if (!response.ok) {
        const errorText = await response.text()
        throw new Error(`OpenAI API error: ${response.status} - ${errorText}`)
      }

      const data = await response.json()
      const message = data.choices?.[0]?.message?.content

      if (!message) {
        throw new Error('No content in OpenAI response')
      }

      return JSON.parse(message) as OpenAIResponse

    } catch (error) {
      lastError = error as Error

      // Don't retry PARSE_FAILED or non-retryable errors
      if (error.code === 'RATE_LIMIT') {
        throw error
      }

      // Retry network errors
      if (attempt < retries && (
        error.message.includes('fetch') ||
        error.message.includes('network') ||
        error.message.includes('ECONNREFUSED') ||
        error.message.includes('timeout')
      )) {
        const delay = baseDelay * Math.pow(2, attempt)
        await sleep(delay)
        baseDelay *= 2
        continue
      }

      throw error
    }
  }

  throw lastError || new Error('Max retries exceeded')
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

    // Call OpenAI API to parse recipe
    let openAIResult: OpenAIResponse
    try {
      openAIResult = await callOpenAI(recipeContent)
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error'
      
      if (error.code === 'RATE_LIMIT') {
        result.code = 'RATE_LIMIT'
        result.error = 'OpenAI rate limit exceeded'
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
    if (!openAIResult.title || !openAIResult.ingredients || !openAIResult.steps) {
      result.code = 'PARSE_FAILED'
      result.error = 'Incomplete recipe data from OpenAI'
      return new Response(JSON.stringify(result), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      })
    }

    // Success
    result.success = true
    result.data = {
      title: openAIResult.title,
      ingredients: openAIResult.ingredients,
      steps: openAIResult.steps,
      servings: openAIResult.servings,
      prep_time: openAIResult.prep_time_minutes,
      cook_time: openAIResult.cook_time_minutes,
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
