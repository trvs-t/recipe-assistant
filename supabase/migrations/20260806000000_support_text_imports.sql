-- Allow the durable importer to process pasted recipe text without inventing a
-- source URL. URL imports keep their existing validation and queue behavior.

ALTER TABLE recipe_import_jobs
    ADD COLUMN source_text TEXT,
    ALTER COLUMN source_url DROP NOT NULL;

ALTER TABLE recipe_import_jobs
    DROP CONSTRAINT IF EXISTS recipe_import_jobs_source_url_check;

ALTER TABLE recipe_import_jobs
    ADD CONSTRAINT recipe_import_jobs_source_check CHECK (
        (
            source_url IS NOT NULL
            AND source_text IS NULL
            AND source_url ~* '^https?://'
        )
        OR (
            source_url IS NULL
            AND source_text IS NOT NULL
            AND length(btrim(source_text)) >= 50
            AND length(source_text) <= 20000
        )
    );

CREATE OR REPLACE FUNCTION enqueue_recipe_import_with_text(
    p_user_id UUID,
    p_source_url TEXT,
    p_source_text TEXT,
    p_idempotency_key TEXT
)
RETURNS TABLE (
    job_id UUID,
    job_status TEXT,
    recipe_id UUID,
    deduplicated BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
    v_job_id UUID;
    v_message_id BIGINT;
    v_inserted BOOLEAN := false;
BEGIN
    IF p_user_id IS NULL THEN
        RAISE EXCEPTION 'user_id is required';
    END IF;
    IF (p_source_url IS NULL) = (p_source_text IS NULL) THEN
        RAISE EXCEPTION 'exactly one source_url or source_text is required';
    END IF;
    IF p_source_url IS NOT NULL AND p_source_url !~* '^https?://' THEN
        RAISE EXCEPTION 'source_url must use http or https';
    END IF;
    IF p_source_text IS NOT NULL AND
        (length(btrim(p_source_text)) < 50 OR length(p_source_text) > 20000) THEN
        RAISE EXCEPTION 'source_text must contain 50 to 20000 characters';
    END IF;
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'idempotency_key must contain 1 to 200 characters';
    END IF;

    INSERT INTO recipe_import_jobs (user_id, source_url, source_text, idempotency_key)
    VALUES (p_user_id, p_source_url, p_source_text, p_idempotency_key)
    ON CONFLICT (user_id, idempotency_key) DO NOTHING
    RETURNING id INTO v_job_id;

    IF v_job_id IS NULL THEN
        SELECT id
        INTO v_job_id
        FROM recipe_import_jobs
        WHERE user_id = p_user_id
          AND idempotency_key = p_idempotency_key;
    ELSE
        v_inserted := true;

        SELECT send
        INTO v_message_id
        FROM pgmq.send(
            'recipe_imports',
            jsonb_build_object('job_id', v_job_id),
            0
        );

        UPDATE recipe_import_jobs
        SET queue_message_id = v_message_id
        WHERE id = v_job_id;
    END IF;

    RETURN QUERY
    SELECT
        jobs.id,
        jobs.status,
        jobs.recipe_id,
        NOT v_inserted
    FROM recipe_import_jobs AS jobs
    WHERE jobs.id = v_job_id;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_recipe_import_with_text(UUID, TEXT, TEXT, TEXT)
    FROM PUBLIC;
GRANT EXECUTE ON FUNCTION enqueue_recipe_import_with_text(UUID, TEXT, TEXT, TEXT)
    TO service_role;

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
    max_attempts INTEGER
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

    SELECT *
    INTO v_message
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
          'queued',
          'fetching',
          'extracting',
          'normalizing',
          'validating',
          'persisting',
          'retry_wait'
      )
      AND jobs.attempt_count < jobs.max_attempts
    RETURNING jobs.attempt_count
    INTO v_attempt_number;

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

    INSERT INTO recipe_import_attempts (
        job_id,
        attempt_number,
        queue_message_id
    ) VALUES (
        v_job_id,
        v_attempt_number,
        v_message.msg_id
    );

    RETURN QUERY
    SELECT
        v_message.msg_id,
        jobs.id,
        jobs.source_url,
        jobs.source_text,
        jobs.attempt_count,
        jobs.max_attempts
    FROM recipe_import_jobs AS jobs
    WHERE jobs.id = v_job_id;
END;
$$;

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
    SELECT *
    INTO v_job
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

    UPDATE recipe_import_jobs
    SET status = 'persisting'
    WHERE id = p_job_id;

    INSERT INTO recipes (
        user_id,
        title,
        source_url,
        description,
        prep_time_minutes,
        cook_time_minutes,
        total_time_minutes,
        servings,
        images,
        cuisine_type,
        dietary_tags,
        status,
        parse_confidence,
        flow_graph
    ) VALUES (
        v_job.user_id,
        p_recipe ->> 'title',
        v_job.source_url,
        NULLIF(p_recipe ->> 'description', ''),
        NULLIF(p_recipe ->> 'prepTimeMinutes', '')::INTEGER,
        NULLIF(p_recipe ->> 'cookTimeMinutes', '')::INTEGER,
        NULLIF(p_recipe ->> 'totalTimeMinutes', '')::INTEGER,
        NULLIF(p_recipe ->> 'servings', '')::INTEGER,
        ARRAY(
            SELECT jsonb_array_elements_text(COALESCE(p_recipe -> 'images', '[]'::JSONB))
        ),
        NULLIF(p_recipe ->> 'cuisineType', ''),
        ARRAY(
            SELECT jsonb_array_elements_text(COALESCE(p_recipe -> 'dietaryTags', '[]'::JSONB))
        ),
        'parsed',
        NULLIF(p_recipe ->> 'parseConfidence', '')::DECIMAL(3,2),
        COALESCE(
            p_recipe -> 'flow',
            '{"derivation":"linear_fallback","nodes":[],"edges":[]}'::JSONB
        )
    )
    RETURNING id INTO v_recipe_id;

    UPDATE recipes
    SET source_text = v_job.source_text
    WHERE id = v_recipe_id;

    INSERT INTO ingredients (
        recipe_id,
        original_text,
        quantity,
        unit,
        name,
        notes,
        sort_order
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

    INSERT INTO steps (
        recipe_id,
        instruction,
        timer_duration_minutes,
        sort_order
    )
    SELECT
        v_recipe_id,
        item ->> 'instruction',
        NULLIF(item ->> 'timerDurationMinutes', '')::INTEGER,
        COALESCE(NULLIF(item ->> 'sortOrder', '')::INTEGER, ordinality::INTEGER - 1)
    FROM jsonb_array_elements(COALESCE(p_recipe -> 'steps', '[]'::JSONB))
        WITH ORDINALITY AS step_rows(item, ordinality);

    UPDATE recipe_import_attempts
    SET
        stage = 'complete',
        fetch_count = GREATEST(fetch_count, 1),
        finished_at = now()
    WHERE job_id = p_job_id
      AND attempt_number = v_job.attempt_count;

    UPDATE recipe_import_jobs
    SET
        status = 'completed',
        recipe_id = v_recipe_id,
        error_code = NULL,
        error_message = NULL,
        error_retryable = NULL,
        next_attempt_at = NULL
    WHERE id = p_job_id;

    IF v_job.queue_message_id IS NOT NULL THEN
        PERFORM pgmq.archive('recipe_imports', v_job.queue_message_id);
    END IF;

    RETURN v_recipe_id;
END;
$$;
