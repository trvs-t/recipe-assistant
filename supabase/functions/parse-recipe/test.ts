import { assertEquals, assertExists } from 'https://deno.land/std@0.168.0/testing/asserts.ts'
import { validateUrl, sanitizeHtml, pruneDom, extractRecipeContent, findRecipeInJsonLd } from './index.ts'

Deno.test('validateUrl - should accept valid HTTP/HTTPS URLs', () => {
  assertExists(validateUrl('https://www.example.com/recipe'))
  assertExists(validateUrl('http://example.com/recipe?id=123'))
  assertExists(validateUrl('https://example.com/path/to/recipe.html'))
})

Deno.test('validateUrl - should reject invalid URLs', () => {
  assertEquals(validateUrl('not-a-url'), null)
  assertEquals(validateUrl('ftp://example.com'), null)
  assertEquals(validateUrl(''), null)
  assertEquals(validateUrl('javascript:alert(1)'), null)
})

Deno.test('sanitizeHtml - should remove dangerous elements', () => {
  const html = `
    <html>
      <head><script>alert('bad')</script><style>.hidden{display:none}</style></head>
      <body>
        <script>document.evil()</script>
        <noscript>No JS</noscript>
        <iframe src="evil.com"></iframe>
        <!-- comments -->
        <form action="/hack"><input name="x"/></form>
        Good content
      </body>
    </html>
  `

  const sanitized = sanitizeHtml(html)

  assertEquals(sanitized.includes('alert'), false)
  assertEquals(sanitized.includes('<script'), false)
  assertEquals(sanitized.includes('<style'), false)
  assertEquals(sanitized.includes('<noscript'), false)
  assertEquals(sanitized.includes('<iframe'), false)
  assertEquals(sanitized.includes('<!--'), false)
  assertEquals(sanitized.includes('<form'), false)
  assertEquals(sanitized.includes('Good Content'), true)
})

Deno.test('sanitizeHtml - should preserve recipe content', () => {
  const html = `
    <div class="recipe">
      <h1>Delicious Pasta</h1>
      <p>Ingredients: flour, eggs, salt</p>
      <p>Steps: mix, knead, cook</p>
    </div>
  `

  const sanitized = sanitizeHtml(html)

  assertEquals(sanitized.includes('Delicious Pasta'), true)
  assertEquals(sanitized.includes('flour, eggs, salt'), true)
  assertEquals(sanitized.includes('mix, knead, cook'), true)
})

Deno.test('pruneDom - should remove non-recipe elements', () => {
  const html = `
    <nav>Navigation</nav>
    <header>Header</header>
    <footer>Footer</footer>
    <aside>Sidebar</aside>
    <div class="recipe">
      <h1>Actual Recipe</h1>
      <p>Recipe content here</p>
    </div>
  `

  const pruned = pruneDom(html)

  assertEquals(pruned.includes('Navigation'), false)
  assertEquals(pruned.includes('Header'), false)
  assertEquals(pruned.includes('Footer'), false)
  assertEquals(pruned.includes('Sidebar'), false)
  assertEquals(pruned.includes('Actual Recipe'), true)
  assertEquals(pruned.includes('Recipe content here'), true)
})

Deno.test('pruneDom - should remove ad-related elements', () => {
  const html = `
    <div class="sidebar-ad">Buy now!</div>
    <div class="advertisement">Special offer</div>
    <div class="ad-banner">Click here</div>
    <div id="social-share">Share buttons</div>
    <div class="related-posts">You might like</div>
    <article class="recipe">
      <p>Real recipe content</p>
    </article>
  `

  const pruned = pruneDom(html)

  assertEquals(pruned.includes('Buy now!'), false)
  assertEquals(pruned.includes('Special offer'), false)
  assertEquals(pruned.includes('Click here'), false)
  assertEquals(pruned.includes('Share buttons'), false)
  assertEquals(pruned.includes('You might like'), false)
  assertEquals(pruned.includes('Real recipe content'), true)
})

Deno.test('pruneDom - should remove style attributes and classes', () => {
  const html = `<div class="some-class" id="some-id" style="color:red" data-value="test">Content</div>`

  const pruned = pruneDom(html)

  assertEquals(pruned.includes('class='), false)
  assertEquals(pruned.includes('id='), false)
  assertEquals(pruned.includes('style='), false)
  assertEquals(pruned.includes('data-'), false)
  assertEquals(pruned.includes('Content'), true)
})

Deno.test('pruneDom - should collapse whitespace', () => {
  const html = `<div>   Lots    of   spaces   </div>`

  const pruned = pruneDom(html)

  assertEquals(pruned.includes('  '), false)
  assertEquals(pruned.includes('Lots of spaces'), true)
})

Deno.test('extractRecipeContent - should find JSON-LD structured data', () => {
  const html = `
    <html>
      <head>
        <script type="application/ld+json">
        {
          "@type": "Recipe",
          "name": "Test Recipe",
          "recipeIngredient": ["1 cup flour", "2 eggs"],
          "recipeInstructions": [{"@type": "HowToStep", "text": "Mix ingredients"}]
        }
        </script>
      </head>
      <body>Other content</body>
    </html>
  `

  const content = extractRecipeContent(html)

  assertEquals(content.includes('Test Recipe'), true)
  assertEquals(content.includes('1 cup flour'), true)
  assertEquals(content.includes('Mix ingredients'), true)
})

Deno.test('extractRecipeContent - should limit content size', () => {
  const largeHtml = '<div>' + 'x'.repeat(20000) + '</div>'

  const content = extractRecipeContent(largeHtml)

  assertEquals(content.length <= 15000, true)
})

Deno.test('extractRecipeContent - should use article/main as fallback', () => {
  const html = `
    <html>
      <body>
        <nav>Skip</nav>
        <article>
          <h1>Article Recipe</h1>
          <p>Ingredients: item 1, item 2</p>
        </article>
      </body>
    </html>
  `

  const content = extractRecipeContent(html)

  assertEquals(content.includes('Article Recipe'), true)
  assertEquals(content.includes('item 1'), true)
  assertEquals(content.includes('Skip'), false)
})

Deno.test('findRecipeInJsonLd - should find Recipe type directly', () => {
  const jsonLd = {
    '@type': 'Recipe',
    name: 'Direct Recipe',
    recipeIngredient: ['flour'],
    recipeInstructions: [{ text: 'Bake' }]
  }

  const result = findRecipeInJsonLd(jsonLd) as Record<string, unknown>

  assertEquals(result?.['name'], 'Direct Recipe')
})

Deno.test('findRecipeInJsonLd - should find Recipe in array', () => {
  const jsonLd = [
    { '@type': 'WebPage' },
    { '@type': 'Recipe', name: 'Array Recipe' },
    { '@type': 'Author' }
  ]

  const result = findRecipeInJsonLd(jsonLd) as Record<string, unknown>

  assertEquals(result?.['name'], 'Array Recipe')
})

Deno.test('findRecipeInJsonLd - should find Recipe in @graph', () => {
  const jsonLd = {
    '@graph': [
      { '@type': 'Organization', name: 'Site' },
      { '@type': 'Recipe', name: 'Graph Recipe' }
    ]
  }

  const result = findRecipeInJsonLd(jsonLd) as Record<string, unknown>

  assertEquals(result?.['name'], 'Graph Recipe')
})

Deno.test('findRecipeInJsonLd - should return null when not found', () => {
  const jsonLd = { '@type': 'WebPage', name: 'Not a recipe' }

  const result = findRecipeInJsonLd(jsonLd)

  assertEquals(result, null)
})

Deno.test('findRecipeInJsonLd - should handle nested @graph arrays', () => {
  const jsonLd = {
    '@graph': [
      {
        '@graph': [
          { '@type': 'Recipe', name: 'Nested Recipe' }
        ]
      }
    ]
  }

  const result = findRecipeInJsonLd(jsonLd) as Record<string, unknown>

  assertEquals(result?.['name'], 'Nested Recipe')
})
