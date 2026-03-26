-- Extension for UUID generation
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================
-- TABLE DEFINITIONS
-- ============================================

-- Recipes table
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
    images TEXT[],
    cuisine_type TEXT,
    dietary_tags TEXT[],
    status TEXT DEFAULT 'pending' 
        CHECK (status IN ('pending', 'parsing', 'parsed', 'draft', 'error')),
    parse_confidence DECIMAL(3,2),
    parse_error TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Ingredients table
CREATE TABLE ingredients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    original_text TEXT NOT NULL,
    quantity DECIMAL(10,4),
    unit TEXT,
    name TEXT NOT NULL,
    notes TEXT,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Steps table
CREATE TABLE steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    instruction TEXT NOT NULL,
    timer_duration_minutes INTEGER,
    sort_order INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- Favorites junction table
CREATE TABLE favorites (
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    PRIMARY KEY (user_id, recipe_id)
);

-- Recipe views history table
CREATE TABLE recipe_views (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE,
    viewed_at TIMESTAMPTZ DEFAULT now()
);

-- ============================================
-- FULL-TEXT SEARCH SETUP
-- ============================================

-- Add search vector column to recipes
ALTER TABLE recipes ADD COLUMN search_vector tsvector;

-- Create GIN index for full-text search
CREATE INDEX idx_recipes_search ON recipes USING GIN (search_vector);

-- ============================================
-- INDEXES
-- ============================================

-- Recipe indexes
CREATE INDEX idx_recipes_user_id ON recipes(user_id);
CREATE INDEX idx_recipes_status ON recipes(status);
CREATE INDEX idx_recipes_user_status ON recipes(user_id, status);

-- Related entity indexes
CREATE INDEX idx_ingredients_recipe_id ON ingredients(recipe_id);
CREATE INDEX idx_steps_recipe_id ON steps(recipe_id);
CREATE INDEX idx_recipe_views_user_viewed ON recipe_views(user_id, viewed_at DESC);

-- ============================================
-- TRIGGER FUNCTIONS
-- ============================================

-- Auto-update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Auto-update search vector
CREATE OR REPLACE FUNCTION update_recipe_search_vector()
RETURNS TRIGGER AS $$
BEGIN
    NEW.search_vector := 
        setweight(to_tsvector('english', COALESCE(NEW.title, '')), 'A') ||
        setweight(to_tsvector('english', COALESCE(NEW.description, '')), 'B') ||
        setweight(to_tsvector('english', COALESCE(array_to_string(NEW.dietary_tags, ' '), '')), 'C') ||
        setweight(to_tsvector('english', COALESCE(NEW.cuisine_type, '')), 'C');
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================
-- TRIGGERS
-- ============================================

-- Trigger for updated_at on recipes
CREATE TRIGGER recipes_updated_at
    BEFORE UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- Trigger for search vector on recipes (INSERT and UPDATE)
CREATE TRIGGER recipes_search_vector_update
    BEFORE INSERT OR UPDATE ON recipes
    FOR EACH ROW
    EXECUTE FUNCTION update_recipe_search_vector();

-- ============================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================

-- Enable RLS on all tables
ALTER TABLE recipes ENABLE ROW LEVEL SECURITY;
ALTER TABLE ingredients ENABLE ROW LEVEL SECURITY;
ALTER TABLE steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE favorites ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_views ENABLE ROW LEVEL SECURITY;

-- Recipes policies
CREATE POLICY "Users can only access their own recipes"
    ON recipes
    FOR ALL
    USING (auth.uid() = user_id);

-- Ingredients policies (access through recipe ownership)
CREATE POLICY "Users can access ingredients for their recipes"
    ON ingredients
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = ingredients.recipe_id 
            AND recipes.user_id = auth.uid()
        )
    );

-- Steps policies (access through recipe ownership)
CREATE POLICY "Users can access steps for their recipes"
    ON steps
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM recipes 
            WHERE recipes.id = steps.recipe_id 
            AND recipes.user_id = auth.uid()
        )
    );

-- Favorites policies
CREATE POLICY "Users can only access their own favorites"
    ON favorites
    FOR ALL
    USING (auth.uid() = user_id);

-- Recipe views policies
CREATE POLICY "Users can only access their own recipe views"
    ON recipe_views
    FOR ALL
    USING (auth.uid() = user_id);

-- ============================================
-- STORAGE
-- ============================================

-- Create recipe-images bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('recipe-images', 'recipe-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: Users can only access their own recipe images
CREATE POLICY "Users can only access their own recipe images"
    ON storage.objects
    FOR ALL
    USING (
        bucket_id = 'recipe-images' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );

-- Allow users to upload to their own folder
CREATE POLICY "Users can upload to their own recipe-images folder"
    ON storage.objects
    FOR INSERT
    WITH CHECK (
        bucket_id = 'recipe-images' 
        AND (storage.foldername(name))[1] = auth.uid()::text
    );
