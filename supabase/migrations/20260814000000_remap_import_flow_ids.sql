-- Persist import flow references with the UUIDs assigned to stored rows.

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
    v_ingredient_id_map JSONB;
    v_step_id_map JSONB;
    v_flow JSONB;
    v_mapped_nodes JSONB;
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

    SELECT COALESCE(
        jsonb_object_agg(item ->> 'id', gen_random_uuid()::TEXT),
        '{}'::JSONB
    )
    INTO v_ingredient_id_map
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'ingredients', '[]'::JSONB))
        AS ingredient_rows(item);

    SELECT COALESCE(
        jsonb_object_agg(item ->> 'id', gen_random_uuid()::TEXT),
        '{}'::JSONB
    )
    INTO v_step_id_map
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'steps', '[]'::JSONB))
        AS step_rows(item);

    IF (SELECT count(*) FROM jsonb_object_keys(v_ingredient_id_map)) <>
        jsonb_array_length(COALESCE(p_recipe -> 'ingredients', '[]'::JSONB))
    THEN
        RAISE EXCEPTION 'recipe ingredient IDs must be present and unique';
    END IF;
    IF (SELECT count(*) FROM jsonb_object_keys(v_step_id_map)) <>
        jsonb_array_length(COALESCE(p_recipe -> 'steps', '[]'::JSONB))
    THEN
        RAISE EXCEPTION 'recipe step IDs must be present and unique';
    END IF;

    v_flow := COALESCE(
        p_recipe -> 'flow',
        '{"derivation":"linear_fallback","nodes":[],"edges":[]}'::JSONB
    );
    IF EXISTS (
        SELECT 1
        FROM jsonb_array_elements(COALESCE(v_flow -> 'nodes', '[]'::JSONB))
            AS flow_nodes(node)
        WHERE NOT (v_step_id_map ? (node ->> 'stepId'))
           OR EXISTS (
                SELECT 1
                FROM jsonb_array_elements_text(
                    COALESCE(node -> 'ingredientIds', '[]'::JSONB)
                ) AS ingredient_ids(source_id)
                WHERE NOT (v_ingredient_id_map ? source_id)
           )
    ) THEN
        RAISE EXCEPTION 'recipe flow references unknown step or ingredient IDs';
    END IF;

    SELECT COALESCE(
        jsonb_agg(
            jsonb_set(
                jsonb_set(
                    node,
                    '{stepId}',
                    to_jsonb(v_step_id_map ->> (node ->> 'stepId')),
                    false
                ),
                '{ingredientIds}',
                COALESCE(
                    (
                        SELECT jsonb_agg(
                            to_jsonb(v_ingredient_id_map ->> source_id)
                            ORDER BY ingredient_ordinality
                        )
                        FROM jsonb_array_elements_text(
                            COALESCE(node -> 'ingredientIds', '[]'::JSONB)
                        ) WITH ORDINALITY
                            AS ingredient_ids(source_id, ingredient_ordinality)
                    ),
                    '[]'::JSONB
                ),
                false
            )
            ORDER BY node_ordinality
        ),
        '[]'::JSONB
    )
    INTO v_mapped_nodes
    FROM jsonb_array_elements(COALESCE(v_flow -> 'nodes', '[]'::JSONB))
        WITH ORDINALITY AS flow_nodes(node, node_ordinality);
    v_flow := jsonb_set(v_flow, '{nodes}', v_mapped_nodes, true);

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
        v_flow
    ) RETURNING id INTO v_recipe_id;

    UPDATE recipes SET source_text = v_job.source_text WHERE id = v_recipe_id;

    INSERT INTO ingredients (
        id, recipe_id, original_text, quantity, unit, name, notes, sort_order
    )
    SELECT
        (v_ingredient_id_map ->> (item ->> 'id'))::UUID,
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
        (v_ingredient_id_map ->> (item ->> 'id'))::UUID,
        (measurement ->> 'quantityMin')::DECIMAL(12,4),
        (measurement ->> 'quantityMax')::DECIMAL(12,4),
        NULLIF(measurement ->> 'unit', ''),
        COALESCE((measurement ->> 'isPrimary')::BOOLEAN, false),
        COALESCE(
            NULLIF(measurement ->> 'sortOrder', '')::INTEGER,
            measurement_ordinality::INTEGER - 1
        )
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'ingredients', '[]'::JSONB))
        AS ingredient_rows(item)
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(item -> 'measurements', '[]'::JSONB))
        WITH ORDINALITY AS measurement_rows(measurement, measurement_ordinality);

    INSERT INTO steps (
        id, recipe_id, instruction, timer_duration_minutes, sort_order
    )
    SELECT
        (v_step_id_map ->> (item ->> 'id'))::UUID,
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

REVOKE ALL ON FUNCTION persist_recipe_import(UUID, INTEGER, JSONB) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION persist_recipe_import(UUID, INTEGER, JSONB)
    TO service_role;
