-- Correct the JSONB record alias used by the in-place ingredient backfill.

CREATE OR REPLACE FUNCTION persist_recipe_ingredient_backfill(
    p_job_id UUID,
    p_attempt_number INTEGER,
    p_ingredients JSONB
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
    v_job recipe_import_jobs%ROWTYPE;
    v_existing_count INTEGER;
    v_input_count INTEGER;
    v_exact_source_match BOOLEAN;
BEGIN
    SELECT * INTO v_job
    FROM recipe_import_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'ingredient backfill job not found';
    END IF;
    IF v_job.status = 'completed' AND v_job.recipe_id IS NOT NULL THEN
        RETURN v_job.recipe_id;
    END IF;
    IF v_job.target_recipe_id IS NULL THEN
        RAISE EXCEPTION 'ingredient backfill job has no target recipe';
    END IF;
    IF v_job.attempt_count <> p_attempt_number THEN
        RAISE EXCEPTION 'ingredient backfill attempt lease is stale';
    END IF;
    IF v_job.status IN ('needs_input', 'failed') THEN
        RAISE EXCEPTION 'terminal ingredient backfill cannot be persisted';
    END IF;
    IF p_ingredients IS NULL OR jsonb_typeof(p_ingredients) <> 'array' THEN
        RAISE EXCEPTION 'ingredient backfill payload must be an array';
    END IF;

    PERFORM 1 FROM recipes WHERE id = v_job.target_recipe_id FOR UPDATE;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'ingredient backfill target recipe not found';
    END IF;

    SELECT count(*)::INTEGER INTO v_existing_count
    FROM ingredients
    WHERE recipe_id = v_job.target_recipe_id
      AND variation_of_id IS NULL;
    v_input_count := jsonb_array_length(p_ingredients);
    IF v_existing_count = 0 OR v_input_count <> v_existing_count THEN
        RAISE EXCEPTION 'ingredient backfill count does not match stored ingredients';
    END IF;

    WITH stored AS (
        SELECT
            ingredients.id,
            ingredients.original_text,
            row_number() OVER (ORDER BY ingredients.sort_order, ingredients.id) AS ordinal
        FROM ingredients
        WHERE ingredients.recipe_id = v_job.target_recipe_id
          AND ingredients.variation_of_id IS NULL
    ), incoming AS (
        SELECT item, ordinality
        FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY
            AS ingredient_rows(item, ordinality)
    )
    SELECT bool_and(stored.original_text = incoming.item ->> 'originalText')
    INTO v_exact_source_match
    FROM stored
    JOIN incoming ON incoming.ordinality = stored.ordinal;

    IF NOT COALESCE(v_exact_source_match, false) THEN
        RAISE EXCEPTION 'ingredient backfill changed or reordered original text';
    END IF;

    UPDATE recipe_import_jobs SET status = 'persisting' WHERE id = p_job_id;

    WITH stored AS (
        SELECT
            ingredients.id,
            row_number() OVER (ORDER BY ingredients.sort_order, ingredients.id) AS ordinal
        FROM ingredients
        WHERE ingredients.recipe_id = v_job.target_recipe_id
          AND ingredients.variation_of_id IS NULL
    ), incoming AS (
        SELECT item, ordinality
        FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY
            AS ingredient_rows(item, ordinality)
    )
    UPDATE ingredients
    SET
        quantity = NULLIF(incoming.item ->> 'quantity', '')::DECIMAL(10,4),
        unit = NULLIF(incoming.item ->> 'unit', ''),
        name = incoming.item ->> 'name',
        notes = NULLIF(incoming.item ->> 'notes', '')
    FROM stored
    JOIN incoming ON incoming.ordinality = stored.ordinal
    WHERE ingredients.id = stored.id;

    DELETE FROM ingredient_measurements
    WHERE ingredient_id IN (
        SELECT id FROM ingredients
        WHERE recipe_id = v_job.target_recipe_id
          AND variation_of_id IS NULL
    );

    WITH stored AS (
        SELECT
            ingredients.id,
            row_number() OVER (ORDER BY ingredients.sort_order, ingredients.id) AS ordinal
        FROM ingredients
        WHERE ingredients.recipe_id = v_job.target_recipe_id
          AND ingredients.variation_of_id IS NULL
    ), incoming AS (
        SELECT item, ordinality
        FROM jsonb_array_elements(p_ingredients) WITH ORDINALITY
            AS ingredient_rows(item, ordinality)
    )
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
    FROM stored
    JOIN incoming ON incoming.ordinality = stored.ordinal
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(incoming.item -> 'measurements', '[]'::JSONB))
        WITH ORDINALITY AS measurement_rows(measurement, measurement_ordinality);

    UPDATE recipe_import_attempts
    SET stage = 'complete', finished_at = now()
    WHERE job_id = p_job_id AND attempt_number = p_attempt_number;

    UPDATE recipe_import_jobs
    SET
        status = 'completed',
        recipe_id = v_job.target_recipe_id,
        error_code = NULL,
        error_message = NULL,
        error_retryable = NULL,
        next_attempt_at = NULL
    WHERE id = p_job_id;

    IF v_job.queue_message_id IS NOT NULL THEN
        PERFORM pgmq.archive('recipe_imports', v_job.queue_message_id);
    END IF;

    RETURN v_job.target_recipe_id;
END;
$$;

REVOKE ALL ON FUNCTION persist_recipe_ingredient_backfill(UUID, INTEGER, JSONB)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION persist_recipe_ingredient_backfill(UUID, INTEGER, JSONB)
    TO service_role;
