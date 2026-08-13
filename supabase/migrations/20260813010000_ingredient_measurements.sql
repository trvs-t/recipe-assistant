-- Preserve source-provided equivalent ingredient measurements and ranges.
-- Ingredient substitutions remain represented by ingredients.variation_of_id.

CREATE TABLE ingredient_measurements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ingredient_id UUID NOT NULL REFERENCES ingredients(id) ON DELETE CASCADE,
    quantity_min DECIMAL(12,4) NOT NULL CHECK (quantity_min > 0),
    quantity_max DECIMAL(12,4) NOT NULL CHECK (quantity_max >= quantity_min),
    unit TEXT,
    is_primary BOOLEAN NOT NULL DEFAULT false,
    sort_order INTEGER NOT NULL CHECK (sort_order >= 0),
    UNIQUE (ingredient_id, sort_order)
);

CREATE UNIQUE INDEX ingredient_measurements_one_primary
    ON ingredient_measurements(ingredient_id)
    WHERE is_primary;

CREATE INDEX ingredient_measurements_ingredient_id
    ON ingredient_measurements(ingredient_id, sort_order);

ALTER TABLE ingredient_measurements ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can access measurements for their ingredients"
    ON ingredient_measurements
    FOR ALL
    USING (
        EXISTS (
            SELECT 1
            FROM ingredients
            JOIN recipes ON recipes.id = ingredients.recipe_id
            WHERE ingredients.id = ingredient_measurements.ingredient_id
              AND recipes.user_id = auth.uid()
        )
    );

GRANT SELECT ON TABLE ingredient_measurements TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE ingredient_measurements TO service_role;

CREATE OR REPLACE FUNCTION persist_recipe_import(
    p_job_id UUID,
    p_attempt_number INTEGER,
    p_recipe JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
    v_job recipe_import_jobs%ROWTYPE;
    v_recipe_id UUID;
BEGIN
    SELECT * INTO v_job
    FROM recipe_import_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'import job not found';
    END IF;
    IF v_job.status = 'completed' AND v_job.recipe_id IS NOT NULL THEN
        RETURN v_job.recipe_id;
    END IF;
    IF v_job.attempt_count <> p_attempt_number THEN
        RAISE EXCEPTION 'import attempt lease is stale';
    END IF;
    IF v_job.status IN ('needs_input', 'failed') THEN
        RAISE EXCEPTION 'terminal import job cannot be persisted';
    END IF;
    IF NULLIF(trim(p_recipe ->> 'title'), '') IS NULL THEN
        RAISE EXCEPTION 'recipe title is required';
    END IF;

    UPDATE recipe_import_jobs SET status = 'persisting' WHERE id = p_job_id;

    INSERT INTO recipes (
        user_id, title, source_url, description, prep_time_minutes,
        cook_time_minutes, total_time_minutes, servings, images, cuisine_type,
        dietary_tags, status, parse_confidence, flow_graph
    ) VALUES (
        v_job.user_id,
        p_recipe ->> 'title',
        v_job.source_url,
        NULLIF(p_recipe ->> 'description', ''),
        NULLIF(p_recipe ->> 'prepTimeMinutes', '')::INTEGER,
        NULLIF(p_recipe ->> 'cookTimeMinutes', '')::INTEGER,
        NULLIF(p_recipe ->> 'totalTimeMinutes', '')::INTEGER,
        NULLIF(p_recipe ->> 'servings', '')::INTEGER,
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_recipe -> 'images', '[]'::JSONB))),
        NULLIF(p_recipe ->> 'cuisineType', ''),
        ARRAY(SELECT jsonb_array_elements_text(COALESCE(p_recipe -> 'dietaryTags', '[]'::JSONB))),
        'parsed',
        NULLIF(p_recipe ->> 'parseConfidence', '')::DECIMAL(3,2),
        COALESCE(p_recipe -> 'flow', '{"derivation":"linear_fallback","nodes":[],"edges":[]}'::JSONB)
    ) RETURNING id INTO v_recipe_id;

    UPDATE recipes SET source_text = v_job.source_text WHERE id = v_recipe_id;

    INSERT INTO ingredients (
        recipe_id, original_text, quantity, unit, name, notes, sort_order
    )
    SELECT
        v_recipe_id,
        item ->> 'originalText',
        NULLIF(item ->> 'quantity', '')::DECIMAL(10,4),
        NULLIF(item ->> 'unit', ''),
        item ->> 'name',
        NULLIF(item ->> 'notes', ''),
        COALESCE(NULLIF(item ->> 'sortOrder', '')::INTEGER, ordinality::INTEGER - 1)
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'ingredients', '[]'::JSONB))
        WITH ORDINALITY AS ingredient_rows(item, ordinality);

    INSERT INTO ingredient_measurements (
        ingredient_id, quantity_min, quantity_max, unit, is_primary, sort_order
    )
    SELECT
        stored.id,
        (measurement ->> 'quantityMin')::DECIMAL(12,4),
        (measurement ->> 'quantityMax')::DECIMAL(12,4),
        NULLIF(measurement ->> 'unit', ''),
        COALESCE((measurement ->> 'isPrimary')::BOOLEAN, false),
        COALESCE(NULLIF(measurement ->> 'sortOrder', '')::INTEGER, measurement_ordinality::INTEGER - 1)
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'ingredients', '[]'::JSONB))
        WITH ORDINALITY AS ingredient_rows(item, ingredient_ordinality)
    JOIN ingredients AS stored
      ON stored.recipe_id = v_recipe_id
     AND stored.sort_order = COALESCE(
         NULLIF(item ->> 'sortOrder', '')::INTEGER,
         ingredient_ordinality::INTEGER - 1
     )
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item -> 'measurements', '[]'::JSONB))
        WITH ORDINALITY AS measurement_rows(measurement, measurement_ordinality);

    INSERT INTO steps (recipe_id, instruction, timer_duration_minutes, sort_order)
    SELECT
        v_recipe_id,
        item ->> 'instruction',
        NULLIF(item ->> 'timerDurationMinutes', '')::INTEGER,
        COALESCE(NULLIF(item ->> 'sortOrder', '')::INTEGER, ordinality::INTEGER - 1)
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'steps', '[]'::JSONB))
        WITH ORDINALITY AS step_rows(item, ordinality);

    UPDATE recipe_import_attempts
    SET stage = 'complete', fetch_count = GREATEST(fetch_count, 1), finished_at = now()
    WHERE job_id = p_job_id AND attempt_number = v_job.attempt_count;

    UPDATE recipe_import_jobs
    SET status = 'completed', recipe_id = v_recipe_id, error_code = NULL,
        error_message = NULL, error_retryable = NULL, next_attempt_at = NULL
    WHERE id = p_job_id;

    IF v_job.queue_message_id IS NOT NULL THEN
        PERFORM pgmq.archive('recipe_imports', v_job.queue_message_id);
    END IF;

    RETURN v_recipe_id;
END;
$$;
