import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts'

import { parseIngredient } from '../_shared/ingredient-parser.ts'

declare const EdgeRuntime: {
  waitUntil: (promise: Promise<unknown>) => void
} | undefined

const FREE_TIER_TIMEOUT_MS = 20000
const MAX_RETRIES = 2
const RETRY_DELAYS_MS = [1000, 2000]

const MIN_TEXT_LENGTH = 50
const MAX_TEXT_LENGTH = 10000

// Browser-like headers to avoid 403 bot detection on sites like BBC Good Food
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

interface TextValidationResult {
  valid: boolean
  reason?: string
}

function stripHtmlTags(text: string): string {
  return text
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

function isUrlPattern(text: string): boolean {
  return /^https?:\/\//i.test(text.trim())
}

function validateTextInput(text: string): TextValidationResult {
  if (typeof text !== 'string') {
    return { valid: false, reason: 'text_not_string' }
  }

  if (isUrlPattern(text)) {
    return { valid: false, reason: 'url_detected_use_url_import' }
  }

  const strippedText = stripHtmlTags(text)

  if (strippedText.length < MIN_TEXT_LENGTH) {
    return { valid: false, reason: 'text_too_short' }
  }

  if (strippedText.length > MAX_TEXT_LENGTH) {
    return { valid: false, reason: 'text_too_long' }
  }

  return { valid: true }
}

async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  retries: number = MAX_RETRIES,
  delays: number[] = RETRY_DELAYS_MS,
): Promise<T> {
  const startTime = Date.now()
  
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      const isRateLimit = error instanceof Error && 
        (error.message.includes('429') || error.message.includes('rate-limit'))
      
      if (!isRateLimit || attempt >= retries) {
        throw error
      }
      
      const elapsed = Date.now() - startTime
      const remaining = FREE_TIER_TIMEOUT_MS - elapsed
      
      if (remaining <= 0) {
        throw error
      }
      
      const delay = Math.min(delays[attempt] || 1000, remaining - 500)
      console.log(`[RETRY] Rate limited, waiting ${delay}ms (attempt ${attempt + 1}/${retries})`)
      
      await new Promise(resolve => setTimeout(resolve, delay))
    }
  }
  
  throw new Error('Retry loop exited unexpectedly')
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImportRecipeRequest {
  url?: string
  text?: string
  source?: 'url' | 'text'
}

interface ImportRecipeResponse {
  recipe_id?: string
  status?: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error'
  error?: string
  validation_error?: string
}

function getSupabaseClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  
  if (!supabaseUrl || !supabaseKey) {
    throw new Error('Supabase environment variables not configured')
  }
  
  return createClient(supabaseUrl, supabaseKey)
}

function isValidUrlFormat(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isHtmlContent(contentType: string | null): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('text/html')
}

function hasPaywallHeaders(headers: Headers): boolean {
  const paywallIndicators = [
    'x-paywall',
    'x-paywall-enabled',
    'x-content-paywalled',
    'x-subscription-required',
    'x-paywall-type',
    'x-nyt-paywall',
    'x-wsj-paywall',
  ]

  for (const indicator of paywallIndicators) {
    if (headers.get(indicator)) {
      return true
    }
  }

  return false
}

async function checkPaywallInHtml(url: string): Promise<boolean> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: BROWSER_HEADERS,
    })

    const reader = response.body?.getReader()
    if (!reader) return false

    const decoder = new TextDecoder()
    let content = ''
    let received = 0
    const maxBytes = 8192

    while (received < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break

      content += decoder.decode(value, { stream: true })
      received += value.length

      const paywallPatterns = [
        /<meta[^>]*paywall/i,
        /<meta[^>]*subscription/i,
        /<meta[^>]*locked/i,
        /property="og:paywall/i,
        /data-paywall/i,
        /paywall-container/i,
        /subscription-required/i,
      ]

      for (const pattern of paywallPatterns) {
        if (pattern.test(content)) {
          reader.cancel()
          return true
        }
      }

      if (content.includes('</head>')) {
        reader.cancel()
        break
      }
    }

    reader.cancel()
    return false
  } catch {
    return false
  }
}

export function hasRecipeJsonLd(html: string): boolean {
  const jsonLdPattern = /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/gi
  const matches = html.match(jsonLdPattern) || []
  
  for (const match of matches) {
    try {
      const jsonContent = match.replace(/<script[^>]*>|<\/script>/gi, '')
      const json = JSON.parse(jsonContent)
      
      if (json['@type'] === 'Recipe' || 
          (Array.isArray(json['@type']) && json['@type'].includes('Recipe'))) {
        return true
      }
      
      if (json['@graph'] && Array.isArray(json['@graph'])) {
        for (const item of json['@graph']) {
          if (item['@type'] === 'Recipe' || 
              (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))) {
            return true
          }
        }
      }
    } catch {
      // Continue to next match
    }
  }
  return false
}

export function hasRecipePatterns(html: string): boolean {
  const patterns = [
    /<[^>]*class="[^"]*recipe/i,
    /<[^>]*itemtype="https?:\/\/schema\.org\/Recipe"/i,
    /ingredients?\s*[:\-]/i,
    /instructions?\s*[:\-]/i,
    /prep\s*time/i,
    /cook\s*time/i,
    /serving/i,
  ]
  return patterns.some(pattern => pattern.test(html))
}

function sanitizeHtml(html: string): string {
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, '')
    .replace(/<noscript\b[^<]*(?:(?!<\/noscript>)<[^<]*)*<\/noscript>/gi, '')
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/<form\b[^<]*(?:(?!<\/form>)<[^<]*)*<\/form>/gi, '')
}

function pruneDom(html: string): string {
  let content = html

  content = content.replace(/<nav\b[^<]*(?:(?!<\/nav>)<[^<]*)*<\/nav>/gi, '')
  content = content.replace(/<header\b[^<]*(?:(?!<\/header>)<[^<]*)*<\/header>/gi, '')
  content = content.replace(/<footer\b[^<]*(?:(?!<\/footer>)<[^<]*)*<\/footer>/gi, '')
  content = content.replace(/<aside\b[^<]*(?:(?!<\/aside>)<[^<]*)*<\/aside>/gi, '')

  content = content.replace(/<div\b[^>]*(?:class|id)[^>]*=["'][^"']*(?:sidebar|advertisement|ad-|ads-|comment|social|share|related|recommended)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')
  content = content.replace(/<div\b[^>]*(?:class|id)[^>]*=["'][^"']*(?:banner|promo|promotion)[^"']*["'][^>]*>[\s\S]*?<\/div>/gi, '')

  content = content.replace(/<div[^>]*>\s*<\/div>/g, '')
  content = content.replace(/<span[^>]*>\s*<\/span>/g, '')

  content = content.replace(/\s+class=["'][^"']*["']/g, '')
  content = content.replace(/\s+id=["'][^"']*["']/g, '')
  content = content.replace(/\s+style=["'][^"']*["']/g, '')
  content = content.replace(/\s+data-[a-z-]+=["'][^"']*["']/gi, '')

  content = content.replace(/\s+/g, ' ').trim()

  return content
}

function findRecipeInJsonLd(data: unknown): unknown | null {
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

    const type = obj['@type']
    if (type === 'Recipe' || (Array.isArray(type) && type.includes('Recipe'))) {
      return obj
    }

    if (obj['@graph']) {
      return findRecipeInJsonLd(obj['@graph'])
    }
  }

  return null
}

export function extractRecipeContent(html: string): string {
  const jsonLdMatch = html.match(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/i)
  if (jsonLdMatch) {
    try {
      const jsonLd = JSON.parse(jsonLdMatch[1])
      const recipe = findRecipeInJsonLd(jsonLd)
      if (recipe) {
        return JSON.stringify(recipe)
      }
    } catch {
    }
  }

  let content = sanitizeHtml(html)
  content = pruneDom(content)

  const articleMatch = content.match(/<(?:article|main)[^>]*>([\s\S]*?)<\/(?:article|main)>/i)
  if (articleMatch && articleMatch[1].length > 500) {
    content = articleMatch[1]
  }

  const recipeContainerMatch = content.match(/<div[^>]*(?:class|id)[^>]*=["'][^"']*(?:recipe|instructions|ingredients|steps| directions)[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)
  if (recipeContainerMatch && recipeContainerMatch[1].length > 500) {
    content = recipeContainerMatch[1]
  }

  if (content.length > 15000) {
    content = content.substring(0, 15000)
  }

  return content
}

const RecipeOutputSchema = z.object({
  title: z.string(),
  ingredients: z.array(z.string()),
  steps: z.array(z.string()),
  servings: z.number().optional(),
  prep_time_minutes: z.number().optional(),
  cook_time_minutes: z.number().optional(),
})

export async function parseWithOpenRouter(content: string): Promise<{
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

  const makeRequest = async () => {
    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemma-3-4b-it:free',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: `You are a recipe parsing assistant. Extract structured recipe data from the provided content. IMPORTANT: You MUST respond with ONLY a valid JSON object, no other text. Schema: {"title": "Recipe name (string, required)", "ingredients": ["ingredient with quantity and unit (string, required)"], "steps": ["step instruction (string, required)"], "servings": number (optional), "prep_time_minutes": number (optional), "cook_time_minutes": number (optional)}. Never deviate from this schema.

Extract the recipe from this content:

${content}`,
          },
        ],
      }),
    })

    if (!response.ok) {
      const errorText = await response.text()
      throw new Error(`OpenRouter API error: ${response.status} ${errorText}`)
    }

    return response.json()
  }

  const data = await retryWithBackoff(makeRequest)
  const message = data.choices?.[0]?.message?.content

  if (!message) {
    throw new Error('No content in OpenRouter response')
  }

  let parsedContent = message.trim()
  const jsonMatch = message.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (jsonMatch) {
    parsedContent = jsonMatch[1].trim()
  }

  const firstChar = parsedContent.indexOf('{')
  const lastChar = parsedContent.lastIndexOf('}')
  if (firstChar !== -1 && lastChar !== -1 && lastChar > firstChar) {
    parsedContent = parsedContent.substring(firstChar, lastChar + 1)
  }

  let result: Record<string, unknown>
  try {
    result = JSON.parse(parsedContent)
  } catch {
    throw new Error(`Failed to parse JSON from model response: ${parsedContent.substring(0, 500)}`)
  }

  if (!result.title || !Array.isArray(result.ingredients) || !Array.isArray(result.steps)) {
    throw new Error(`Model returned invalid schema: ${JSON.stringify(result).substring(0, 500)}`)
  }

  return RecipeOutputSchema.parse(result)
}

async function detectRecipeContent(url: string): Promise<boolean> {
  try {
    console.log(`[detectRecipeContent] Fetching URL: ${url}`)
    const response = await fetch(url, {
      method: 'GET',
      headers: BROWSER_HEADERS,
    })

    console.log(`[detectRecipeContent] Response status: ${response.status}`)
    if (!response.ok) {
      console.log(`[detectRecipeContent] Non-OK response, returning false`)
      return false
    }

    const reader = response.body?.getReader()
    if (!reader) return false

    const decoder = new TextDecoder()
    let content = ''
    let received = 0
    const maxBytes = 32768

    while (received < maxBytes) {
      const { done, value } = await reader.read()
      if (done) break

      content += decoder.decode(value, { stream: true })
      received += value.length

      if (hasRecipeJsonLd(content)) {
        console.log(`[detectRecipeContent] Found JSON-LD recipe!`)
        reader.cancel()
        return true
      }

      if (hasRecipePatterns(content)) {
        console.log(`[detectRecipeContent] Found recipe patterns!`)
        reader.cancel()
        return true
      }

      if (content.includes('</body>') || content.length > maxBytes) {
        reader.cancel()
        break
      }
    }

    console.log(`[detectRecipeContent] Scanned ${received} bytes, no recipe detected`)
    reader.cancel()
    return false
  } catch (error) {
    console.log(`[detectRecipeContent] Error: ${error}`)
    return false
  }
}

async function validateUrl(url: string): Promise<{ valid: boolean; reason?: string; paywall?: boolean }> {
  if (!isValidUrlFormat(url)) {
    return { valid: false, reason: 'Invalid URL format' }
  }

  try {
    const response = await fetch(url, {
      method: 'HEAD',
      headers: BROWSER_HEADERS,
      redirect: 'follow',
    })

    if (!response.ok) {
      return { valid: false, reason: `Failed to fetch URL: ${response.status}` }
    }

    const contentType = response.headers.get('content-type')
    if (!isHtmlContent(contentType)) {
      return { valid: false, reason: 'URL does not return HTML content' }
    }

    if (hasPaywallHeaders(response.headers)) {
      return { valid: false, reason: 'URL is behind a paywall', paywall: true }
    }

    const hasPaywall = await checkPaywallInHtml(url)
    if (hasPaywall) {
      return { valid: false, reason: 'URL is behind a paywall', paywall: true }
    }

    return { valid: true }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { valid: false, reason: `Failed to fetch URL: ${message}` }
  }
}

async function processRecipeAsync(recipeId: string, url: string, sourceText?: string): Promise<void> {
  const sourceInfo = sourceText ? 'text input' : url
  console.log(`[BACKGROUND] Starting processRecipeAsync for recipe ${recipeId} from ${sourceInfo}`)
  
  addEventListener('unhandledrejection', (ev) => {
    console.error('[BACKGROUND] Unhandled rejection:', ev.reason)
    const supabase = getSupabaseClient()
    supabase.from('recipes')
      .update({ status: 'error', error: String(ev.reason) })
      .eq('id', recipeId)
  })

  const supabase = getSupabaseClient()
  
  try {
    console.log(`[BACKGROUND] Step 1: Updating status to 'parsing'`)

    await supabase
      .from('recipes')
      .update({ status: 'parsing' })
      .eq('id', recipeId)

    console.log(`[BACKGROUND] Step 1b: Status updated to 'parsing' successfully`)

    let content: string

    if (sourceText) {
      console.log(`[BACKGROUND] Step 2: Using provided text input (length: ${sourceText.length})`)
      content = stripHtmlTags(sourceText)
    } else {
      console.log(`[BACKGROUND] Step 2: Fetching URL ${url}`)
      const response = await fetch(url, {
        headers: BROWSER_HEADERS,
        signal: AbortSignal.timeout(15000),
      })

      if (!response.ok) {
        throw new Error(`Failed to fetch URL: ${response.status} ${response.statusText}`)
      }

      console.log(`[BACKGROUND] Step 3: Extracting recipe content`)
      const html = await response.text()
      content = extractRecipeContent(html)
    }

    if (!content || content.length < 100) {
      throw new Error('Could not extract recipe content from page')
    }

    console.log(`[BACKGROUND] Step 4: Parsing with OpenAI (content length: ${content.length})`)
    const parsed = await parseWithOpenRouter(content)

    console.log(`[BACKGROUND] Step 5: Inserting ${parsed.ingredients.length} ingredients`)
    for (let i = 0; i < parsed.ingredients.length; i++) {
      const ing = parseIngredient(parsed.ingredients[i])
      await supabase.from('ingredients').insert({
        recipe_id: recipeId,
        original_text: ing.original_text,
        quantity: ing.quantity,
        unit: ing.unit,
        name: ing.name,
        sort_order: i,
      })
    }

    console.log(`[BACKGROUND] Step 6: Inserting ${parsed.steps.length} steps`)
    for (let i = 0; i < parsed.steps.length; i++) {
      await supabase.from('steps').insert({
        recipe_id: recipeId,
        instruction: parsed.steps[i],
        sort_order: i,
      })
    }

    const description = sourceText ? 'Imported from text' : `Imported from ${url}`
    console.log(`[BACKGROUND] Step 7: Updating recipe to 'parsed' status with title: ${parsed.title}`)
    await supabase
      .from('recipes')
      .update({
        status: 'parsed',
        title: parsed.title,
        description: description,
        servings: parsed.servings,
        prep_time_minutes: parsed.prep_time_minutes,
        cook_time_minutes: parsed.cook_time_minutes,
        total_time_minutes: (parsed.prep_time_minutes || 0) + (parsed.cook_time_minutes || 0),
      })
      .eq('id', recipeId)
    
    console.log(`[BACKGROUND] Complete! Recipe ${recipeId} parsed successfully`)
  } catch (error) {
    console.error(`[BACKGROUND] Failed to process recipe ${recipeId}:`, error)
    await supabase
      .from('recipes')
      .update({
        status: 'error',
        parse_error: error instanceof Error ? error.message : String(error),
      })
      .eq('id', recipeId)
  }
}

async function importRecipe(url: string, userId: string): Promise<{ status: number; response: ImportRecipeResponse }> {
  const validation = await validateUrl(url)
  
  if (!validation.valid) {
    return {
      status: 400,
      response: {
        error: validation.reason,
      },
    }
  }

  const hasRecipe = await detectRecipeContent(url)
  const initialStatus = hasRecipe ? 'pending' : 'draft'

  const supabase = getSupabaseClient()
  
  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({
      user_id: userId,
      source_url: url,
      status: initialStatus,
      title: '',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create recipe:', error)
    return {
      status: 500,
      response: {
        error: 'Failed to create recipe record',
      },
    }
  }

  if (hasRecipe) {
    if (typeof EdgeRuntime !== 'undefined') {
      EdgeRuntime.waitUntil(processRecipeAsync(recipe.id, url))
    } else {
      await processRecipeAsync(recipe.id, url)
    }
  }

  return {
    status: 202,
    response: {
      recipe_id: recipe.id,
      status: initialStatus,
    },
  }
}

async function importRecipeFromText(text: string, userId: string): Promise<{ status: number; response: ImportRecipeResponse }> {
  const supabase = getSupabaseClient()
  
  const { data: recipe, error } = await supabase
    .from('recipes')
    .insert({
      user_id: userId,
      source_text: text,
      status: 'pending',
      title: '',
    })
    .select()
    .single()

  if (error) {
    console.error('Failed to create recipe from text:', error)
    return {
      status: 500,
      response: {
        error: 'Failed to create recipe record',
      },
    }
  }

  if (typeof EdgeRuntime !== 'undefined') {
    EdgeRuntime.waitUntil(processRecipeAsync(recipe.id, '', text))
  } else {
    await processRecipeAsync(recipe.id, '', text)
  }

  return {
    status: 202,
    response: {
      recipe_id: recipe.id,
      status: 'pending',
    },
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  if (req.method !== 'POST') {
    const response: ImportRecipeResponse = {
      error: 'Method not allowed',
    }
    return new Response(
      JSON.stringify(response),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }

  try {
    const body: ImportRecipeRequest = await req.json()

    // Check for mutual exclusivity of url and text
    if (body.url && body.text) {
      const response: ImportRecipeResponse = {
        error: 'Cannot provide both url and text. Use only one.',
        validation_error: 'url_and_text_mutually_exclusive',
      }
      return new Response(
        JSON.stringify(response),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle text import mode
    if (body.source === 'text' || body.text !== undefined) {
      if (!body.text || typeof body.text !== 'string') {
        const response: ImportRecipeResponse = {
          error: 'Text content is required',
          validation_error: 'text_required',
        }
        return new Response(
          JSON.stringify(response),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const validation = validateTextInput(body.text)
      if (!validation.valid) {
        const response: ImportRecipeResponse = {
          error: `Invalid text input: ${validation.reason}`,
          validation_error: validation.reason,
        }
        return new Response(
          JSON.stringify(response),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      const authHeader = req.headers.get('authorization')
      if (!authHeader) {
        const response: ImportRecipeResponse = {
          error: 'Authorization required',
        }
        return new Response(
          JSON.stringify(response),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      let userId = '00000000-0000-0000-0000-000000000001'
      
      const token = authHeader.replace('Bearer ', '')
      if (token && token !== 'test-token') {
        try {
          const parts = token.split('.')
          if (parts.length === 3) {
            const payload = JSON.parse(atob(parts[1]))
            userId = payload.sub || userId
          }
        } catch {
          // Use default user ID
        }
      }

      const result = await importRecipeFromText(body.text, userId)

      return new Response(
        JSON.stringify(result.response),
        { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Handle URL import mode (default)
    if (!body.url || typeof body.url !== 'string') {
      const response: ImportRecipeResponse = {
        error: 'URL is required',
      }
      return new Response(
        JSON.stringify(response),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      const response: ImportRecipeResponse = {
        error: 'Authorization required',
      }
      return new Response(
        JSON.stringify(response),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    let userId = '00000000-0000-0000-0000-000000000001'
    
    const token = authHeader.replace('Bearer ', '')
    if (token && token !== 'test-token') {
      try {
        const parts = token.split('.')
        if (parts.length === 3) {
          const payload = JSON.parse(atob(parts[1]))
          userId = payload.sub || userId
        }
      } catch {
        // Use default user ID
      }
    }

    const result = await importRecipe(body.url, userId)

    return new Response(
      JSON.stringify(result.response),
      { status: result.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    console.error('Import recipe error:', error)
    const response: ImportRecipeResponse = {
      error: 'Internal server error',
    }
    return new Response(
      JSON.stringify(response),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
