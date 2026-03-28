# Edge Functions

**Related Docs:** [System Overview](./01-system-overview.md) | [Database Schema](./02-database-schema.md) | [API Contracts](./05-api-contracts.md)

## Overview

Edge Functions are Deno-based serverless functions that handle:
- URL validation (AI-based recipe detection)
- Recipe parsing (extraction from HTML)
- Image processing

**Location:** `supabase/functions/`

## validate-url

Validates if a URL contains a valid recipe using AI analysis.

### Interface

**Endpoint:** `POST /functions/v1/validate-url`

**Request:**
```typescript
interface ValidateUrlRequest {
  url: string;  // Must be valid HTTP/HTTPS URL
}
```

**Response (200):**
```typescript
interface ValidateUrlResponse {
  valid: boolean;
  confidence: number;  // 0.0 - 1.0
  method?: 'schema' | 'ai';  // How validation was determined
  reason?: string;  // Present if valid: false
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid request (malformed URL)
- `500` - Server error

**Error Response (500):**
```typescript
{
  error: string;
  message: string;
}
```

### Implementation

**File:** `supabase/functions/validate-url/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();
    
    // 1. Fetch URL content
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Recipe Saver Bot)' }
    });
    
    if (!response.ok) {
      return new Response(
        JSON.stringify({ valid: false, reason: 'Could not fetch URL' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const html = await response.text();
    
    // 2. Check for Recipe schema
    const hasRecipeSchema = html.includes('"@type": "Recipe"') || 
                           html.includes('"@type":"Recipe"');
    
    if (hasRecipeSchema) {
      return new Response(
        JSON.stringify({ valid: true, confidence: 1.0, method: 'schema' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // 3. AI validation for unstructured content
    const aiResult = await validateWithAI(html);
    
    return new Response(
      JSON.stringify({
        valid: aiResult.isRecipe,
        confidence: aiResult.confidence,
        method: 'ai'
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    return new Response(
      JSON.stringify({ valid: false, reason: error.message }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});

// TODO: Implement AI validation
async function validateWithAI(html: string): Promise<{ isRecipe: boolean; confidence: number }> {
  // Use OpenAI to analyze HTML content
  throw new Error('Not implemented');
}
```

## parse-recipe

Extracts structured recipe data from URL HTML content.

### Interface

**Endpoint:** `POST /functions/v1/parse-recipe`

**Request:**
```typescript
interface ParseRecipeRequest {
  recipe_id: string;  // UUID of recipe record to update
  url: string;
}
```

**Response (200):**
```typescript
interface ParseRecipeResponse {
  success: boolean;
  parser: 'allrecipes' | 'bbcgoodfood' | 'schema' | 'ai';
  ingredientCount: number;
  stepCount: number;
}
```

**Status Codes:**
- `200` - Success
- `400` - Invalid request
- `500` - Parse error

### Implementation

**File:** `supabase/functions/parse-recipe/index.ts`

```typescript
import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: Array<{
    original: string;
    quantity?: number;
    unit?: string;
    name: string;
    notes?: string;
  }>;
  steps: Array<{
    instruction: string;
    timerMinutes?: number;
  }>;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
}

serve(async (req) => {
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  try {
    const { recipe_id, url } = await req.json();
    
    // Update status to parsing
    await supabase.from('recipes')
      .update({ status: 'parsing' })
      .eq('id', recipe_id);
    
    // Fetch HTML
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Recipe Saver Bot)' }
    });
    const html = await response.text();
    
    // Try parsers in priority order
    let parsed: ParsedRecipe | null = null;
    let parserUsed = '';
    
    // 1. Site-specific parser
    const siteParser = getParser(url);
    if (siteParser) {
      parsed = await siteParser.parse(html);
      parserUsed = siteParser.name;
    }
    
    // 2. Schema extraction
    if (!parsed) {
      parsed = await parseFromSchema(html);
      parserUsed = 'schema';
    }
    
    // 3. AI extraction
    if (!parsed) {
      parsed = await parseWithAI(html);
      parserUsed = 'ai';
    }
    
    if (!parsed) {
      throw new Error('Could not parse recipe');
    }
    
    // Update recipe
    await supabase.from('recipes').update({
      title: parsed.title,
      description: parsed.description,
      prep_time_minutes: parsed.prepTime,
      cook_time_minutes: parsed.cookTime,
      servings: parsed.servings,
      status: 'parsed',
      parse_confidence: parserUsed === 'ai' ? 0.8 : 0.95
    }).eq('id', recipe_id);
    
    // Insert ingredients
    const ingredientsData = parsed.ingredients.map((ing, idx) => ({
      recipe_id,
      original_text: ing.original,
      quantity: ing.quantity,
      unit: ing.unit,
      name: ing.name,
      notes: ing.notes,
      sort_order: idx
    }));
    await supabase.from('ingredients').insert(ingredientsData);
    
    // Insert steps
    const stepsData = parsed.steps.map((step, idx) => ({
      recipe_id,
      instruction: step.instruction,
      timer_duration_minutes: step.timerMinutes,
      sort_order: idx
    }));
    await supabase.from('steps').insert(stepsData);
    
    return new Response(
      JSON.stringify({
        success: true,
        parser: parserUsed,
        ingredientCount: ingredientsData.length,
        stepCount: stepsData.length
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
    
  } catch (error) {
    await supabase.from('recipes')
      .update({ status: 'error', parse_error: error.message })
      .eq('id', recipe_id);
    
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      { headers: { 'Content-Type': 'application/json' }, status: 500 }
    );
  }
});

// TODO: Implement parser selection
function getParser(url: string): { name: string; parse: (html: string) => Promise<ParsedRecipe> } | null {
  return null;
}

// TODO: Implement schema extraction
async function parseFromSchema(html: string): Promise<ParsedRecipe | null> {
  return null;
}

// TODO: Implement AI extraction
async function parseWithAI(html: string): Promise<ParsedRecipe> {
  throw new Error('Not implemented');
}
```

## Parser Plugin System

**Location:** `supabase/functions/parse-recipe/parsers/`

### Base Parser Interface

```typescript
// supabase/functions/parse-recipe/parsers/base.ts
export interface ParsedRecipe {
  title: string;
  description?: string;
  ingredients: Array<{
    original: string;
    quantity?: number;
    unit?: string;
    name: string;
    notes?: string;
  }>;
  steps: Array<{
    instruction: string;
    timerMinutes?: number;
  }>;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  cuisineType?: string;
  dietaryTags?: string[];
}

export abstract class BaseRecipeParser {
  abstract readonly domain: string;
  abstract readonly priority: number;  // Higher = tried first
  
  abstract canParse(url: string): boolean;
  abstract parse(html: string): Promise<ParsedRecipe | null>;
}
```

### Example: AllRecipes Parser

```typescript
// supabase/functions/parse-recipe/parsers/allrecipes.ts
import { BaseRecipeParser, ParsedRecipe } from './base.ts';

export class AllRecipesParser extends BaseRecipeParser {
  domain = 'allrecipes.com';
  priority = 100;
  
  canParse(url: string): boolean {
    return url.includes('allrecipes.com');
  }
  
  async parse(html: string): Promise<ParsedRecipe | null> {
    // TODO: Implement AllRecipes-specific extraction
    return null;
  }
}
```

### Parser Registry

```typescript
// supabase/functions/parse-recipe/parsers/index.ts
import { BaseRecipeParser } from './base.ts';
import { AllRecipesParser } from './allrecipes.ts';
// Import other parsers...

const parsers: BaseRecipeParser[] = [
  new AllRecipesParser(),
  // Add new parsers here
];

export function getParser(url: string): BaseRecipeParser | null {
  return parsers
    .filter(p => p.canParse(url))
    .sort((a, b) => b.priority - a.priority)[0] || null;
}
```

## Shared Types

**Location:** `supabase/functions/_shared/types.ts`

```typescript
// Common types used across functions

export interface RecipeStatus {
  id: string;
  status: 'pending' | 'parsing' | 'parsed' | 'draft' | 'error';
  parseError?: string;
}

export interface IngredientData {
  original: string;
  quantity?: number;
  unit?: string;
  name: string;
  notes?: string;
}

export interface StepData {
  instruction: string;
  timerMinutes?: number;
}
```

## Environment Variables

**Required:**
```bash
SUPABASE_URL=https://your-instance.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
OPENROUTER_API_KEY=sk-...
```

**Configuration:**
```bash
# In supabase/config.toml or docker-compose.yml
[functions.validate-url]
verify_jwt = true

[functions.parse-recipe]
verify_jwt = true
```

## Testing

**Location:** `supabase/functions/validate-url/test.ts`

```typescript
import { assertEquals } from 'https://deno.land/std@0.177.0/testing/asserts.ts';

Deno.test("validate-url returns valid for schema.org recipe", async () => {
  // TODO: Implement test
});

Deno.test("validate-url returns valid for AI-detected recipe", async () => {
  // TODO: Implement test
});
```

## Deployment

```bash
# Deploy single function
supabase functions deploy validate-url

# Deploy all functions
supabase functions deploy
```

## Related Files

| Component | Path |
|-----------|------|
| URL Validator | `supabase/functions/validate-url/index.ts` |
| Recipe Parser | `supabase/functions/parse-recipe/index.ts` |
| Parser Base | `supabase/functions/parse-recipe/parsers/base.ts` |
| Shared Types | `supabase/functions/_shared/types.ts` |
| Tests | `supabase/functions/*/test.ts` |
| Config | `supabase/config.toml` |
