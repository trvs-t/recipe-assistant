# Database Schema

**Related Docs:** [System Overview](./01-system-overview.md) | [Edge Functions](./03-edge-functions.md)

## Entity Relationship Diagram

```
┌──────────────┐       ┌──────────────────┐       ┌──────────────┐
│    users     │       │     recipes      │       │  favorites   │
├──────────────┤       ├──────────────────┤       ├──────────────┤
│ id (PK)      │──────<│ user_id (FK)     │       │ user_id (FK) │
│ email        │       │ id (PK)          │>──────│ recipe_id(FK)│
│ preferences  │       │ title            │       │ created_at   │
│ created_at   │       │ source_url       │       └──────────────┘
└──────────────┘       │ description      │
                       │ prep_time_mins   │       ┌──────────────┐
                       │ cook_time_mins   │       │recipe_views  │
                       │ total_time_mins  │       ├──────────────┤
                       │ servings         │       │ id (PK)      │
                       │ images[]         │       │ user_id (FK) │>────┐
                       │ cuisine_type     │       │ recipe_id(FK)│<────┘
                       │ dietary_tags[]   │       │ viewed_at    │
                       │ status           │       └──────────────┘
                       │ parse_confidence │
                       │ parse_error      │
                       │ created_at       │
                       │ updated_at       │
                       └────────┬─────────┘
                                │
                                │
              ┌─────────────────┴──────────────────┐
              │                                    │
              ▼                                    ▼
┌──────────────────────────┐          ┌──────────────────────────┐
│      ingredients         │          │         steps            │
├──────────────────────────┤          ├──────────────────────────┤
│ id (PK)                  │          │ id (PK)                  │
│ recipe_id (FK)           │          │ recipe_id (FK)           │
│ original_text            │          │ instruction              │
│ quantity                 │          │ timer_duration_mins      │
│ unit                     │          │ sort_order               │
│ name                     │          │ created_at               │
│ notes                    │          └──────────────────────────┘
│ sort_order               │
│ created_at               │
└──────────────────────────┘
```

## Core Tables

### recipes
Main recipe entity. Status tracks parsing lifecycle.

```sql
CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    source_url TEXT,
    description TEXT,
    prep_time_minutes INTEGER,
    cook_time_minutes INTEGER,
    total_time_minutes INTEGER,
    servings INTEGER,
    images TEXT[], -- Array of storage paths
    cuisine_type TEXT,
    dietary_tags TEXT[],
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'parsing', 'parsed', 'draft', 'error')),
    parse_confidence DECIMAL(3,2), -- 0.00 to 1.00
    parse_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Status Lifecycle:**
- `pending` → Just created, waiting for validation
- `parsing` → Validation passed, extraction in progress
- `parsed` → Successfully extracted, ready to use
- `draft` → URL invalid or low confidence, needs manual editing
- `error` → Parse failed, error logged

### ingredients
Structured ingredient data with normalized fields for scaling.

```sql
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    original_text TEXT NOT NULL, -- Raw text from source
    quantity DECIMAL(10,4), -- Numeric value for calculations
    unit TEXT, -- Normalized: cup, tbsp, tsp, g, oz, etc.
    name TEXT NOT NULL, -- Normalized ingredient name
    notes TEXT, -- e.g., "softened", "diced"
    sort_order INTEGER NOT NULL, -- Display order
    created_at TIMESTAMPTZ DEFAULT now()
);
```

**Unit Standards:**
| Unit | Aliases | Category |
|------|---------|----------|
| cup | cups, c | volume |
| tbsp | tablespoon, tbs, T | volume |
| tsp | teaspoon, t | volume |
| ml | milliliter | volume |
| l | liter, litres | volume |
| g | gram, grams | weight |
| kg | kilogram | weight |
| oz | ounce | weight |
| lb | pound, pounds | weight |
| piece | pieces, whole | count |

### steps
Cooking instructions with optional timer support.

```sql
CREATE TABLE steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    instruction TEXT NOT NULL,
    timer_duration_minutes INTEGER, -- Optional step timer
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
```

### favorites
Many-to-many junction for user favorite recipes.

```sql
CREATE TABLE favorites (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, recipe_id)
);
```

### recipe_views
Tracks recipe view history for "recently viewed" feature.

```sql
CREATE TABLE recipe_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT now()
);
```

## Row Level Security (RLS)

All tables enforce user isolation via RLS policies.

```sql
-- Enable RLS
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_views ENABLE ROW LEVEL SECURITY;

-- Users can only access their own data
CREATE POLICY "Users can only access their own recipes" ON recipes
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their recipe ingredients" ON ingredients
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = ingredients.recipe_id 
            AND recipes.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can only access their recipe steps" ON steps
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = steps.recipe_id 
            AND recipes.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can only access their favorites" ON favorites
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can only access their views" ON recipe_views
    FOR ALL USING (auth.uid() = user_id);
```

## Database Functions

### scale_ingredients
Calculates scaled ingredient quantities.

```sql
CREATE OR REPLACE FUNCTION scale_ingredients(
    p_recipe_id UUID,
    p_scale_factor DECIMAL(10,4)
) RETURNS TABLE (
    ingredient_id UUID,
    original_quantity DECIMAL(10,4),
    scaled_quantity DECIMAL(10,4),
    unit TEXT,
    display_quantity TEXT
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        i.id,
        i.quantity,
        i.quantity * p_scale_factor,
        i.unit,
        format_measurement(i.quantity * p_scale_factor, i.unit)
    FROM ingredients i
    WHERE i.recipe_id = p_recipe_id;
END;
$$ LANGUAGE plpgsql;
```

### update_updated_at
Trigger function for auto-updating timestamps.

```sql
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
```

## Indexes

```sql
-- Performance indexes
CREATE INDEX idx_recipes_user_id ON recipes(user_id);
CREATE INDEX idx_recipes_status ON recipes(status);
CREATE INDEX idx_recipes_user_status ON recipes(user_id, status);
CREATE INDEX idx_ingredients_recipe_id ON ingredients(recipe_id);
CREATE INDEX idx_steps_recipe_id ON steps(recipe_id);
CREATE INDEX idx_recipe_views_user_viewed ON recipe_views(user_id, viewed_at DESC);

-- Full-text search
ALTER TABLE recipes ADD COLUMN search_vector tsvector;
CREATE INDEX idx_recipes_search ON recipes USING GIN(search_vector);

-- Update search vector trigger
CREATE OR REPLACE FUNCTION update_recipe_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_search_vector
    BEFORE INSERT OR UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_recipe_search_vector();
```

## Storage Buckets

```sql
-- Recipe images bucket
INSERT INTO storage.buckets (id, name, public) 
VALUES ('recipe-images', 'recipe-images', true);

-- Storage policy: users can only access their own images
CREATE POLICY "Users can access their recipe images" ON storage.objects
    FOR ALL USING (
        bucket_id = 'recipe-images' AND 
        (storage.foldername(name))[1] = auth.uid()::text
    );
```

## Migration Files

Migrations stored in `supabase/migrations/`:

```
supabase/migrations/
├── 00000000000000_initial_schema.sql
├── 00000000000001_add_search_vector.sql
└── 00000000000002_add_indexes.sql
```

**Naming:** `YYYYMMDDHHMMSS_description.sql`

## Related Files

| Component | File Path |
|-----------|-----------|
| Migrations | `supabase/migrations/*.sql` |
| Edge Functions | `supabase/functions/` (see [03-edge-functions.md](./03-edge-functions.md)) |
| Frontend Models | `apps/mobile/lib/data/models/` (see [04-frontend-patterns.md](./04-frontend-patterns.md)) |
