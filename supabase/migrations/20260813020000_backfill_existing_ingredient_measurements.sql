-- Queue an idempotent, in-place ingredient normalization pass for imported
-- recipes that predate first-class equivalent measurements.

ALTER TABLE recipe_import_jobs
    ADD COLUMN target_recipe_id UUID REFERENCES recipes(id) ON DELETE CASCADE;

DROP FUNCTION IF EXISTS claim_recipe_import(INTEGER);

CREATE FUNCTION claim_recipe_import(
    p_visibility_timeout_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
    message_id BIGINT,
    job_id UUID,
    source_url TEXT,
    source_text TEXT,
    attempt_number INTEGER,
    max_attempts INTEGER,
    target_recipe_id UUID
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
    v_message pgmq.message_record;
    v_job_id UUID;
    v_attempt_number INTEGER;
BEGIN
    IF p_visibility_timeout_seconds < 30 THEN
        RAISE EXCEPTION 'visibility timeout must be at least 30 seconds';
    END IF;

    SELECT * INTO v_message
    FROM pgmq.read('recipe_imports', p_visibility_timeout_seconds, 1)
    LIMIT 1;

    IF NOT FOUND THEN
        RETURN;
    END IF;

    BEGIN
        v_job_id := (v_message.message ->> 'job_id')::UUID;
    EXCEPTION WHEN invalid_text_representation THEN
        PERFORM pgmq.archive('recipe_imports', v_message.msg_id);
        RETURN;
    END;

    UPDATE recipe_import_jobs AS jobs
    SET
        status = 'fetching',
        attempt_count = jobs.attempt_count + 1,
        next_attempt_at = NULL,
        queue_message_id = v_message.msg_id,
        error_code = NULL,
        error_message = NULL,
        error_retryable = NULL
    WHERE jobs.id = v_job_id
      AND jobs.status IN (
          'queued', 'fetching', 'extracting', 'normalizing', 'validating',
          'persisting', 'retry_wait'
      )
      AND jobs.attempt_count < jobs.max_attempts
    RETURNING jobs.attempt_count INTO v_attempt_number;

    IF v_attempt_number IS NULL THEN
        UPDATE recipe_import_attempts AS attempts
        SET
            finished_at = COALESCE(attempts.finished_at, now()),
            error_code = COALESCE(attempts.error_code, 'LEASE_EXPIRED'),
            error_message = COALESCE(
                attempts.error_message,
                'The worker lease expired and the attempt budget was exhausted'
            )
        FROM recipe_import_jobs AS jobs
        WHERE jobs.id = v_job_id
          AND attempts.job_id = jobs.id
          AND attempts.attempt_number = jobs.attempt_count
          AND jobs.status NOT IN ('completed', 'needs_input', 'failed')
          AND jobs.attempt_count >= jobs.max_attempts;

        UPDATE recipe_import_jobs AS jobs
        SET
            status = 'failed',
            error_code = 'MAX_ATTEMPTS_EXHAUSTED',
            error_message = 'The worker lease expired after the final attempt',
            error_retryable = false,
            next_attempt_at = NULL
        WHERE jobs.id = v_job_id
          AND jobs.status NOT IN ('completed', 'needs_input', 'failed')
          AND jobs.attempt_count >= jobs.max_attempts;

        PERFORM pgmq.archive('recipe_imports', v_message.msg_id);
        RETURN;
    END IF;

    INSERT INTO recipe_import_attempts (job_id, attempt_number, queue_message_id)
    VALUES (v_job_id, v_attempt_number, v_message.msg_id);

    RETURN QUERY
    SELECT
        v_message.msg_id,
        jobs.id,
        jobs.source_url,
        jobs.source_text,
        jobs.attempt_count,
        jobs.max_attempts,
        jobs.target_recipe_id
    FROM recipe_import_jobs AS jobs
    WHERE jobs.id = v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION claim_recipe_import(INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION claim_recipe_import(INTEGER) TO service_role;

CREATE FUNCTION get_recipe_ingredient_backfill_source(p_recipe_id UUID)
RETURNS TABLE (recipe_id UUID, ingredients JSONB)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        recipes.id,
        jsonb_agg(ingredients.original_text ORDER BY ingredients.sort_order, ingredients.id)
    FROM recipes
    JOIN ingredients ON ingredients.recipe_id = recipes.id
    WHERE recipes.id = p_recipe_id
      AND ingredients.variation_of_id IS NULL
    GROUP BY recipes.id;
$$;

REVOKE ALL ON FUNCTION get_recipe_ingredient_backfill_source(UUID) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_recipe_ingredient_backfill_source(UUID) TO service_role;

CREATE FUNCTION persist_recipe_ingredient_backfill(
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

DO $$
DECLARE
    v_recipe RECORD;
    v_job_id UUID;
    v_message_id BIGINT;
BEGIN
    FOR v_recipe IN
        SELECT recipes.id, recipes.user_id, recipes.source_url
        FROM recipes
        WHERE recipes.user_id IS NOT NULL
          AND recipes.source_url IS NOT NULL
          AND EXISTS (
              SELECT 1 FROM ingredients
              WHERE ingredients.recipe_id = recipes.id
                AND ingredients.variation_of_id IS NULL
          )
          AND NOT EXISTS (
              SELECT 1
              FROM ingredient_measurements
              JOIN ingredients ON ingredients.id = ingredient_measurements.ingredient_id
              WHERE ingredients.recipe_id = recipes.id
          )
    LOOP
        v_job_id := NULL;
        INSERT INTO recipe_import_jobs (
            user_id, source_url, idempotency_key, target_recipe_id
        ) VALUES (
            v_recipe.user_id,
            v_recipe.source_url,
            'ingredient-measurements-v1:' || v_recipe.id::TEXT,
            v_recipe.id
        )
        ON CONFLICT (user_id, idempotency_key) DO NOTHING
        RETURNING id INTO v_job_id;

        IF v_job_id IS NOT NULL THEN
            SELECT send INTO v_message_id
            FROM pgmq.send(
                'recipe_imports',
                jsonb_build_object('job_id', v_job_id),
                0
            );
            UPDATE recipe_import_jobs
            SET queue_message_id = v_message_id
            WHERE id = v_job_id;
        END IF;
    END LOOP;
END;
$$;
