-- User-owned recipe folders. A recipe may belong to zero or more folders.

CREATE TABLE folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT folders_name_nonempty CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX idx_folders_user_name_lower
    ON folders (user_id, lower(name));

CREATE TABLE recipe_folders (
    recipe_id UUID NOT NULL REFERENCES recipes(id) ON DELETE CASCADE,
    folder_id UUID NOT NULL REFERENCES folders(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (recipe_id, folder_id)
);

CREATE INDEX idx_recipe_folders_folder_id
    ON recipe_folders(folder_id);

CREATE TRIGGER folders_updated_at
    BEFORE UPDATE ON folders
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_folders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can only access their own folders"
    ON folders
    FOR ALL
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can read their own recipe folders"
    ON recipe_folders
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM recipes
            WHERE recipes.id = recipe_folders.recipe_id
              AND recipes.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM folders
            WHERE folders.id = recipe_folders.folder_id
              AND folders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can add their own recipe folders"
    ON recipe_folders
    FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1
            FROM recipes
            WHERE recipes.id = recipe_folders.recipe_id
              AND recipes.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM folders
            WHERE folders.id = recipe_folders.folder_id
              AND folders.user_id = auth.uid()
        )
    );

CREATE POLICY "Users can remove their own recipe folders"
    ON recipe_folders
    FOR DELETE
    USING (
        EXISTS (
            SELECT 1
            FROM recipes
            WHERE recipes.id = recipe_folders.recipe_id
              AND recipes.user_id = auth.uid()
        )
        AND EXISTS (
            SELECT 1
            FROM folders
            WHERE folders.id = recipe_folders.folder_id
              AND folders.user_id = auth.uid()
        )
    );

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    folders,
    recipe_folders
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    folders,
    recipe_folders
TO service_role;

CREATE OR REPLACE FUNCTION set_recipe_folders(
    p_recipe_id UUID,
    p_folder_ids UUID[]
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
    requested_folder_ids UUID[] := COALESCE(p_folder_ids, '{}'::UUID[]);
BEGIN
    IF auth.uid() IS NULL THEN
        RAISE EXCEPTION 'Authentication is required';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM recipes
        WHERE recipes.id = p_recipe_id
          AND recipes.user_id = auth.uid()
    ) THEN
        RAISE EXCEPTION 'Recipe is not available';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM unnest(requested_folder_ids) AS requested(folder_id)
        LEFT JOIN folders
            ON folders.id = requested.folder_id
           AND folders.user_id = auth.uid()
        WHERE folders.id IS NULL
    ) THEN
        RAISE EXCEPTION 'Folder is not available';
    END IF;

    DELETE FROM recipe_folders
    WHERE recipe_folders.recipe_id = p_recipe_id;

    INSERT INTO recipe_folders (recipe_id, folder_id)
    SELECT p_recipe_id, requested.folder_id
    FROM unnest(requested_folder_ids) AS requested(folder_id)
    ON CONFLICT (recipe_id, folder_id) DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION set_recipe_folders(UUID, UUID[]) TO authenticated;
