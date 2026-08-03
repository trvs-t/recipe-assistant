-- Durable recipe-import jobs and recipe flow payloads for the web rebuild.
-- Local development may apply this with `supabase db reset`; preserving local
-- rows from the legacy application is intentionally not required.

CREATE EXTENSION IF NOT EXISTS pgmq;

SELECT pgmq.create('recipe_imports');

ALTER TABLE recipes
    ADD COLUMN flow_graph JSONB NOT NULL DEFAULT
        '{"derivation":"linear_fallback","nodes":[],"edges":[]}'::JSONB,
    ADD CONSTRAINT recipes_flow_graph_is_object
        CHECK (jsonb_typeof(flow_graph) = 'object');

CREATE TABLE recipe_import_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    source_url TEXT NOT NULL CHECK (source_url ~* '^https?://'),
    idempotency_key TEXT NOT NULL CHECK (length(idempotency_key) BETWEEN 1 AND 200),
    status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN (
        'queued',
        'fetching',
        'extracting',
        'normalizing',
        'validating',
        'persisting',
        'retry_wait',
        'completed',
        'needs_input',
        'failed'
    )),
    attempt_count INTEGER NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
    max_attempts INTEGER NOT NULL DEFAULT 3 CHECK (max_attempts > 0),
    queue_message_id BIGINT,
    recipe_id UUID REFERENCES recipes(id) ON DELETE SET NULL,
    next_attempt_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    error_retryable BOOLEAN,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, idempotency_key)
);

CREATE TABLE recipe_import_attempts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    job_id UUID NOT NULL REFERENCES recipe_import_jobs(id) ON DELETE CASCADE,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    queue_message_id BIGINT NOT NULL,
    stage TEXT NOT NULL DEFAULT 'fetch' CHECK (stage IN (
        'fetch',
        'extract',
        'normalize',
        'validate',
        'persist',
        'complete'
    )),
    fetch_count INTEGER NOT NULL DEFAULT 0 CHECK (fetch_count BETWEEN 0 AND 4),
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at TIMESTAMPTZ,
    error_code TEXT,
    error_message TEXT,
    UNIQUE (job_id, attempt_number)
);

CREATE INDEX idx_recipe_import_jobs_user_created
    ON recipe_import_jobs(user_id, created_at DESC);
CREATE INDEX idx_recipe_import_jobs_status_next_attempt
    ON recipe_import_jobs(status, next_attempt_at);
CREATE INDEX idx_recipe_import_attempts_job
    ON recipe_import_attempts(job_id, attempt_number);

CREATE TRIGGER recipe_import_jobs_updated_at
    BEFORE UPDATE ON recipe_import_jobs
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE recipe_import_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE recipe_import_attempts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read their own recipe import jobs"
    ON recipe_import_jobs
    FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can read attempts for their recipe import jobs"
    ON recipe_import_attempts
    FOR SELECT
    USING (
        EXISTS (
            SELECT 1
            FROM recipe_import_jobs
            WHERE recipe_import_jobs.id = recipe_import_attempts.job_id
              AND recipe_import_jobs.user_id = auth.uid()
        )
    );

CREATE OR REPLACE FUNCTION enqueue_recipe_import(
    p_user_id UUID,
    p_source_url TEXT,
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
    IF p_source_url IS NULL OR p_source_url !~* '^https?://' THEN
        RAISE EXCEPTION 'source_url must use http or https';
    END IF;
    IF p_idempotency_key IS NULL OR length(p_idempotency_key) NOT BETWEEN 1 AND 200 THEN
        RAISE EXCEPTION 'idempotency_key must contain 1 to 200 characters';
    END IF;

    INSERT INTO recipe_import_jobs (user_id, source_url, idempotency_key)
    VALUES (p_user_id, p_source_url, p_idempotency_key)
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

CREATE OR REPLACE FUNCTION claim_recipe_import(
    p_visibility_timeout_seconds INTEGER DEFAULT 120
)
RETURNS TABLE (
    message_id BIGINT,
    job_id UUID,
    source_url TEXT,
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

CREATE OR REPLACE FUNCTION finish_recipe_import_error(
    p_job_id UUID,
    p_attempt_number INTEGER,
    p_error_code TEXT,
    p_error_message TEXT,
    p_retryable BOOLEAN,
    p_retry_delay_seconds INTEGER DEFAULT 0
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pgmq
AS $$
DECLARE
    v_job recipe_import_jobs%ROWTYPE;
    v_next_status TEXT;
    v_new_message_id BIGINT;
BEGIN
    SELECT *
    INTO v_job
    FROM recipe_import_jobs
    WHERE id = p_job_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'import job not found';
    END IF;
    IF v_job.status IN ('completed', 'needs_input', 'failed') THEN
        RETURN v_job.status;
    END IF;
    IF v_job.attempt_count <> p_attempt_number THEN
        RETURN v_job.status;
    END IF;

    IF p_retryable AND v_job.attempt_count < v_job.max_attempts THEN
        v_next_status := 'retry_wait';

        SELECT send
        INTO v_new_message_id
        FROM pgmq.send(
            'recipe_imports',
            jsonb_build_object('job_id', p_job_id),
            GREATEST(p_retry_delay_seconds, 0)
        );
    ELSIF p_error_code IN ('RECIPE_NOT_FOUND', 'INSUFFICIENT_CONTENT') THEN
        v_next_status := 'needs_input';
    ELSE
        v_next_status := 'failed';
    END IF;

    UPDATE recipe_import_attempts
    SET
        finished_at = now(),
        error_code = p_error_code,
        error_message = p_error_message
    WHERE job_id = p_job_id
      AND attempt_number = v_job.attempt_count;

    UPDATE recipe_import_jobs
    SET
        status = v_next_status,
        queue_message_id = v_new_message_id,
        next_attempt_at = CASE
            WHEN v_next_status = 'retry_wait'
            THEN now() + make_interval(secs => GREATEST(p_retry_delay_seconds, 0))
            ELSE NULL
        END,
        error_code = p_error_code,
        error_message = p_error_message,
        error_retryable = p_retryable
    WHERE id = p_job_id;

    IF v_job.queue_message_id IS NOT NULL THEN
        PERFORM pgmq.archive('recipe_imports', v_job.queue_message_id);
    END IF;

    RETURN v_next_status;
END;
$$;

REVOKE ALL ON FUNCTION enqueue_recipe_import(UUID, TEXT, TEXT) FROM PUBLIC;
REVOKE ALL ON FUNCTION claim_recipe_import(INTEGER) FROM PUBLIC;
REVOKE ALL ON FUNCTION persist_recipe_import(UUID, INTEGER, JSONB) FROM PUBLIC;
REVOKE ALL ON FUNCTION finish_recipe_import_error(UUID, INTEGER, TEXT, TEXT, BOOLEAN, INTEGER) FROM PUBLIC;

GRANT EXECUTE ON FUNCTION enqueue_recipe_import(UUID, TEXT, TEXT) TO service_role;
GRANT EXECUTE ON FUNCTION claim_recipe_import(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION persist_recipe_import(UUID, INTEGER, JSONB) TO service_role;
GRANT EXECUTE ON FUNCTION finish_recipe_import_error(UUID, INTEGER, TEXT, TEXT, BOOLEAN, INTEGER) TO service_role;
