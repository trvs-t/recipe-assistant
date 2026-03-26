import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface ValidateUrlRequest {
  url: string
}

type ValidationReason = 'MALFORMED_URL' | 'NOT_HTML' | 'PAYWALL' | 'FETCH_FAILED'

interface ValidateUrlResponse {
  valid: boolean
  reason?: ValidationReason
  retryable?: boolean
}

/**
 * Check if URL has valid format (starts with http:// or https://)
 */
function isValidUrlFormat(url: string): boolean {
  try {
    const parsed = new URL(url)
    return parsed.protocol === 'http:' || parsed.protocol === 'https:'
  } catch {
    return false
  }
}

/**
 * Check if content-type indicates HTML
 */
function isHtmlContent(contentType: string | null): boolean {
  if (!contentType) return false
  return contentType.toLowerCase().includes('text/html')
}

/**
 * Check for paywall indicators in response headers
 * Common paywall indicators:
 * - X-Paywall-Enabled header
 * - X-Content-Paywalled header
 * - Various subscription-related headers
 */
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

/**
 * Check for paywall indicators in meta tags by examining the HTML content
 * This is a lightweight check - we only fetch a small portion of the page
 */
async function checkPaywallInHtml(url: string): Promise<boolean> {
  try {
    // Fetch only first 8KB to check meta tags
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)',
      },
    })

    // Read only first 8KB to check for paywall meta tags
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

      // Check for paywall indicators in what we've received so far
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

      // Stop once we have the head section
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

/**
 * Validate a URL for recipe parsing
 * 1. Check URL format (http/https)
 * 2. Fetch headers to verify content-type is HTML
 * 3. Check for paywall indicators
 */
async function validateUrl(url: string): Promise<ValidateUrlResponse> {
  // Step 1: Validate URL format
  if (!isValidUrlFormat(url)) {
    return {
      valid: false,
      reason: 'MALFORMED_URL',
      retryable: false,
    }
  }

  try {
    // Step 2: Fetch headers only (HEAD request)
    const response = await fetch(url, {
      method: 'HEAD',
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; RecipeBot/1.0)',
      },
      redirect: 'follow',
    })

    if (!response.ok) {
      return {
        valid: false,
        reason: 'FETCH_FAILED',
        retryable: response.status >= 500 || response.status === 429,
      }
    }

    // Step 3: Check content-type is HTML
    const contentType = response.headers.get('content-type')
    if (!isHtmlContent(contentType)) {
      return {
        valid: false,
        reason: 'NOT_HTML',
        retryable: false,
      }
    }

    // Step 4: Check for paywall indicators in headers
    if (hasPaywallHeaders(response.headers)) {
      return {
        valid: false,
        reason: 'PAYWALL',
        retryable: false,
      }
    }

    // Step 5: Check for paywall indicators in HTML meta tags
    const hasPaywall = await checkPaywallInHtml(url)
    if (hasPaywall) {
      return {
        valid: false,
        reason: 'PAYWALL',
        retryable: false,
      }
    }

    // URL is valid
    return {
      valid: true,
    }
  } catch (error) {
    return {
      valid: false,
      reason: 'FETCH_FAILED',
      retryable: true,
    }
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body: ValidateUrlRequest = await req.json()

    if (!body.url || typeof body.url !== 'string') {
      const response: ValidateUrlResponse = {
        valid: false,
        reason: 'MALFORMED_URL',
        retryable: false,
      }
      return new Response(
        JSON.stringify(response),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const result = await validateUrl(body.url)

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  } catch (error) {
    const response: ValidateUrlResponse = {
      valid: false,
      reason: 'FETCH_FAILED',
      retryable: true,
    }
    return new Response(
      JSON.stringify(response),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 500 }
    )
  }
})
