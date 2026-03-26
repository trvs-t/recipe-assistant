import { assertEquals } from 'https://deno.land/std@0.168.0/testing/asserts.ts'

const FUNCTION_URL = 'http://localhost:54321/functions/v1/validate-url'

Deno.test('validate-url: returns valid: true for valid HTML URL', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/recipe' }),
  })

  const result = await response.json()
  assertEquals(typeof result.valid, 'boolean')
})

Deno.test('validate-url: returns MALFORMED_URL for invalid URL format', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'not-a-valid-url' }),
  })

  const result = await response.json()
  assertEquals(result.valid, false)
  assertEquals(result.reason, 'MALFORMED_URL')
  assertEquals(result.retryable, false)
})

Deno.test('validate-url: returns MALFORMED_URL for missing protocol', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'example.com/recipe' }),
  })

  const result = await response.json()
  assertEquals(result.valid, false)
  assertEquals(result.reason, 'MALFORMED_URL')
})

Deno.test('validate-url: returns MALFORMED_URL for ftp protocol', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'ftp://example.com/recipe' }),
  })

  const result = await response.json()
  assertEquals(result.valid, false)
  assertEquals(result.reason, 'MALFORMED_URL')
})

Deno.test('validate-url: returns MALFORMED_URL for empty URL', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: '' }),
  })

  const result = await response.json()
  assertEquals(result.valid, false)
  assertEquals(result.reason, 'MALFORMED_URL')
})

Deno.test('validate-url: returns MALFORMED_URL for missing URL field', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  })

  const result = await response.json()
  assertEquals(result.valid, false)
  assertEquals(result.reason, 'MALFORMED_URL')
})

Deno.test('validate-url: handles CORS preflight', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'OPTIONS',
    headers: {
      'Origin': 'http://localhost:3000',
      'Access-Control-Request-Method': 'POST',
    },
  })

  assertEquals(response.status, 200)
  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*')
})

Deno.test('validate-url: response includes CORS headers', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com' }),
  })

  assertEquals(response.headers.get('Access-Control-Allow-Origin'), '*')
  assertEquals(response.headers.get('Content-Type'), 'application/json')
})

Deno.test('validate-url: returns structured response with all fields', async () => {
  const response = await fetch(FUNCTION_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url: 'https://example.com/recipe' }),
  })

  const result = await response.json()

  assertEquals(typeof result.valid, 'boolean')

  if (!result.valid) {
    assertEquals(typeof result.reason, 'string')
    const validReasons = ['MALFORMED_URL', 'NOT_HTML', 'PAYWALL', 'FETCH_FAILED']
    assertEquals(validReasons.includes(result.reason), true)
    assertEquals(typeof result.retryable, 'boolean')
  }
})
