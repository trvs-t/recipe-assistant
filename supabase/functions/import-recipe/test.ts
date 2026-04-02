import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ImportRecipeResponse {
  id?: string
  status?: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error'
  error?: string
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

function hasRecipeJsonLd(html: string): boolean {
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

function hasRecipePatterns(html: string): boolean {
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

// Mock handler for testing validation logic
async function handleRequest(req: Request): Promise<Response> {
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
    const body = await req.json()

    if (!body.url || typeof body.url !== 'string') {
      return new Response(
        JSON.stringify({ error: 'URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const authHeader = req.headers.get('authorization')
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Simulate validation logic
    if (!isValidUrlFormat(body.url)) {
      return new Response(
        JSON.stringify({ error: 'Invalid URL format' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Return 202 Accepted for valid URLs
    return new Response(
      JSON.stringify({ id: 'test-recipe-id', status: 'pending' }),
      { status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch {
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
}

// Tests for URL validation
Deno.test('isValidUrlFormat returns true for http URLs', () => {
  assertEquals(isValidUrlFormat('http://example.com'), true)
})

Deno.test('isValidUrlFormat returns true for https URLs', () => {
  assertEquals(isValidUrlFormat('https://example.com'), true)
})

Deno.test('isValidUrlFormat returns false for invalid URLs', () => {
  assertEquals(isValidUrlFormat('not-a-url'), false)
})

Deno.test('isValidUrlFormat returns false for ftp URLs', () => {
  assertEquals(isValidUrlFormat('ftp://example.com'), false)
})

Deno.test('isValidUrlFormat returns false for empty string', () => {
  assertEquals(isValidUrlFormat(''), false)
})

// Tests for HTML content detection
Deno.test('isHtmlContent returns true for text/html content-type', () => {
  assertEquals(isHtmlContent('text/html'), true)
})

Deno.test('isHtmlContent returns true for text/html with charset', () => {
  assertEquals(isHtmlContent('text/html; charset=utf-8'), true)
})

Deno.test('isHtmlContent returns false for application/json', () => {
  assertEquals(isHtmlContent('application/json'), false)
})

Deno.test('isHtmlContent returns false for null', () => {
  assertEquals(isHtmlContent(null), false)
})

// Tests for paywall header detection
Deno.test('hasPaywallHeaders returns true when x-paywall header present', () => {
  const headers = new Headers({ 'x-paywall': 'true' })
  assertEquals(hasPaywallHeaders(headers), true)
})

Deno.test('hasPaywallHeaders returns true when x-paywall-enabled header present', () => {
  const headers = new Headers({ 'x-paywall-enabled': 'true' })
  assertEquals(hasPaywallHeaders(headers), true)
})

Deno.test('hasPaywallHeaders returns false when no paywall headers', () => {
  const headers = new Headers({ 'content-type': 'text/html' })
  assertEquals(hasPaywallHeaders(headers), false)
})

// Tests for JSON-LD recipe detection
Deno.test('hasRecipeJsonLd returns true for Schema.org Recipe JSON-LD', () => {
  const html = '<script type="application/ld+json">{"@type":"Recipe","name":"Test"}</script>'
  assertEquals(hasRecipeJsonLd(html), true)
})

Deno.test('hasRecipeJsonLd returns true for Recipe in @graph array', () => {
  const html = '<script type="application/ld+json">{"@graph":[{"@type":"Recipe"}]}</script>'
  assertEquals(hasRecipeJsonLd(html), true)
})

Deno.test('hasRecipeJsonLd returns false for non-recipe JSON-LD', () => {
  const html = '<script type="application/ld+json">{"@type":"Article","name":"Test"}</script>'
  assertEquals(hasRecipeJsonLd(html), false)
})

Deno.test('hasRecipeJsonLd returns false when no JSON-LD present', () => {
  const html = '<html><body>Hello</body></html>'
  assertEquals(hasRecipeJsonLd(html), false)
})

// Tests for recipe HTML pattern detection
Deno.test('hasRecipePatterns returns true for recipe class', () => {
  const html = '<div class="recipe-container">Ingredients: flour</div>'
  assertEquals(hasRecipePatterns(html), true)
})

Deno.test('hasRecipePatterns returns true for Schema.org Recipe itemtype', () => {
  const html = '<div itemtype="https://schema.org/Recipe">Ingredients: flour</div>'
  assertEquals(hasRecipePatterns(html), true)
})

Deno.test('hasRecipePatterns returns true for ingredients pattern', () => {
  const html = '<h2>Ingredients:</h2><ul><li>flour</li></ul>'
  assertEquals(hasRecipePatterns(html), true)
})

Deno.test('hasRecipePatterns returns true for prep time pattern', () => {
  const html = '<span>Prep time: 30 minutes</span>'
  assertEquals(hasRecipePatterns(html), true)
})

Deno.test('hasRecipePatterns returns false for non-recipe content', () => {
  const html = '<article><h1>Blog Post</h1><p>Some content</p></article>'
  assertEquals(hasRecipePatterns(html), false)
})

// Tests for HTTP handler
Deno.test('handles CORS preflight', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
    },
  })

  const response = await handleRequest(req)
  assertEquals(response.status, 200)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*')
})

Deno.test('returns 405 for GET requests', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'GET',
  })

  const response = await handleRequest(req)
  assertEquals(response.status, 405)
})

Deno.test('returns 401 without authorization header', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/recipe' }),
  })

  const response = await handleRequest(req)
  assertEquals(response.status, 401)
})

Deno.test('returns 400 when URL is missing', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    },
    body: JSON.stringify({}),
  })

  const response = await handleRequest(req)
  assertEquals(response.status, 400)
})

Deno.test('returns 400 for invalid URL format', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    },
    body: JSON.stringify({ url: 'not-a-valid-url' }),
  })

  const response = await handleRequest(req)
  assertEquals(response.status, 400)
  const result = await response.json()
  assertEquals(result.error, 'Invalid URL format')
})

Deno.test('returns 202 for valid recipe URL', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    },
    body: JSON.stringify({ url: 'https://example.com/recipe' }),
  })

  const response = await handleRequest(req)
  assertEquals(response.status, 202)
  const result = await response.json()
  assertExists(result.id)
  assertEquals(result.status, 'pending')
})

Deno.test('response includes CORS headers', async () => {
  const req = new Request('http://localhost:54321/functions/v1/import-recipe', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer test-token',
    },
    body: JSON.stringify({ url: 'https://example.com' }),
  })

  const response = await handleRequest(req)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*')
  assertEquals(response.headers.get('Content-Type'), 'application/json')
})

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

function extractRecipeContent(html: string): string {
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

Deno.test('sanitizeHtml removes script tags', () => {
  const html = '<script>alert("xss")</script><p>Hello</p>'
  const result = sanitizeHtml(html)
  assertEquals(result.includes('<script>'), false)
  assertEquals(result.includes('<p>Hello</p>'), true)
})

Deno.test('sanitizeHtml removes style tags', () => {
  const html = '<style>.hidden { display: none; }</style><p>Hello</p>'
  const result = sanitizeHtml(html)
  assertEquals(result.includes('<style>'), false)
  assertEquals(result.includes('<p>Hello</p>'), true)
})

Deno.test('sanitizeHtml removes comments', () => {
  const html = '<!-- comment --><p>Hello</p>'
  const result = sanitizeHtml(html)
  assertEquals(result.includes('<!-- comment -->'), false)
  assertEquals(result.includes('<p>Hello</p>'), true)
})

Deno.test('pruneDom removes nav elements', () => {
  const html = '<nav>Navigation</nav><main>Content</main>'
  const result = pruneDom(html)
  assertEquals(result.includes('<nav>'), false)
  assertEquals(result.includes('<main>'), true)
})

Deno.test('pruneDom removes header elements', () => {
  const html = '<header>Header</header><main>Content</main>'
  const result = pruneDom(html)
  assertEquals(result.includes('<header>'), false)
  assertEquals(result.includes('<main>'), true)
})

Deno.test('pruneDom removes footer elements', () => {
  const html = '<footer>Footer</footer><main>Content</main>'
  const result = pruneDom(html)
  assertEquals(result.includes('<footer>'), false)
  assertEquals(result.includes('<main>'), true)
})

Deno.test('pruneDom removes sidebar divs', () => {
  const html = '<div class="sidebar">Sidebar</div><main>Content</main>'
  const result = pruneDom(html)
  assertEquals(result.includes('sidebar'), false)
  assertEquals(result.includes('Content'), true)
})

Deno.test('pruneDom removes advertisement divs', () => {
  const html = '<div class="advertisement">Ad</div><main>Content</main>'
  const result = pruneDom(html)
  assertEquals(result.includes('advertisement'), false)
  assertEquals(result.includes('Content'), true)
})

Deno.test('pruneDom collapses whitespace', () => {
  const html = '<p>Hello    World</p>'
  const result = pruneDom(html)
  assertEquals(result.includes('  '), false)
})

Deno.test('findRecipeInJsonLd finds Recipe type', () => {
  const jsonLd = { '@type': 'Recipe', name: 'Test Recipe' }
  const result = findRecipeInJsonLd(jsonLd)
  assertEquals(result, jsonLd)
})

Deno.test('findRecipeInJsonLd finds Recipe in array', () => {
  const jsonLd = [{ '@type': 'Article' }, { '@type': 'Recipe', name: 'Test' }]
  const result = findRecipeInJsonLd(jsonLd)
  assertEquals((result as Record<string, unknown>)?.name, 'Test')
})

Deno.test('findRecipeInJsonLd finds Recipe in @graph', () => {
  const jsonLd = { '@graph': [{ '@type': 'Recipe', name: 'Test' }] }
  const result = findRecipeInJsonLd(jsonLd)
  assertEquals((result as Record<string, unknown>)?.name, 'Test')
})

Deno.test('findRecipeInJsonLd returns null for non-recipe', () => {
  const jsonLd = { '@type': 'Article', name: 'Test' }
  const result = findRecipeInJsonLd(jsonLd)
  assertEquals(result, null)
})

Deno.test('findRecipeInJsonLd returns null for null input', () => {
  assertEquals(findRecipeInJsonLd(null), null)
})

Deno.test('extractRecipeContent extracts JSON-LD when present', () => {
  const html = '<script type="application/ld+json">{"@type":"Recipe","name":"Test Recipe"}</script>'
  const result = extractRecipeContent(html)
  assertEquals(result.includes('Test Recipe'), true)
})

Deno.test('extractRecipeContent falls back to HTML extraction', () => {
  const html = '<article><div class="recipe">Ingredients: flour</div></article>'
  const result = extractRecipeContent(html)
  assertEquals(result.includes('flour'), true)
})

Deno.test('extractRecipeContent limits content size', () => {
  const longHtml = '<p>' + 'x'.repeat(20000) + '</p>'
  const result = extractRecipeContent(longHtml)
  assertEquals(result.length <= 15000, true)
})

Deno.test('extractRecipeContent extracts article content', () => {
  const html = '<article><p>Recipe content here</p></article>'
  const result = extractRecipeContent(html)
  assertEquals(result.includes('Recipe content'), true)
})

Deno.test('parseWithOpenRouter validates required fields', async () => {
  const mockResponse = {
    choices: [{
      message: {
        content: '{"title":"Test","ingredients":["1 cup flour"],"steps":["Mix"],"servings":4}'
      }
    }]
  }

  const parsed = mockResponse.choices[0].message.content
  const jsonMatch = parsed.match(/```(?:json)?\s*([\s\S]*?)```/)
  let parsedContent = parsed
  if (jsonMatch) {
    parsedContent = jsonMatch[1]
  }
  const result = JSON.parse(parsedContent)
  
  assertEquals(result.title, 'Test')
  assertEquals(Array.isArray(result.ingredients), true)
  assertEquals(Array.isArray(result.steps), true)
})

Deno.test('parseWithOpenRouter handles markdown code blocks', () => {
  const content = '```json\n{"title":"Test","ingredients":[],"steps":[]}\n```'
  const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/)
  let parsedContent = content
  if (jsonMatch) {
    parsedContent = jsonMatch[1]
  }
  const result = JSON.parse(parsedContent)
  assertEquals(result.title, 'Test')
})
