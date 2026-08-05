-- Reject semantically empty or impossible recipe records at the database
-- boundary. NOT VALID keeps the migration deployable when legacy rows exist,
-- while PostgreSQL still enforces each constraint for new and changed rows.

ALTER TABLE recipes
    ADD CONSTRAINT recipes_title_nonempty
        CHECK (btrim(title) <> '') NOT VALID,
    ADD CONSTRAINT recipes_servings_positive
        CHECK (servings IS NULL OR servings > 0) NOT VALID,
    ADD CONSTRAINT recipes_times_nonnegative
        CHECK (
            (prep_time_minutes IS NULL OR prep_time_minutes >= 0)
            AND (cook_time_minutes IS NULL OR cook_time_minutes >= 0)
            AND (total_time_minutes IS NULL OR total_time_minutes >= 0)
        ) NOT VALID;

ALTER TABLE ingredients
    ADD CONSTRAINT ingredients_original_text_nonempty
        CHECK (btrim(original_text) <> '') NOT VALID,
    ADD CONSTRAINT ingredients_name_nonempty
        CHECK (btrim(name) <> '') NOT VALID,
    ADD CONSTRAINT ingredients_quantity_positive
        CHECK (quantity IS NULL OR quantity > 0) NOT VALID,
    ADD CONSTRAINT ingredients_sort_order_nonnegative
        CHECK (sort_order >= 0) NOT VALID;

ALTER TABLE steps
    ADD CONSTRAINT steps_instruction_nonempty
        CHECK (btrim(instruction) <> '') NOT VALID,
    ADD CONSTRAINT steps_timer_positive
        CHECK (
            timer_duration_minutes IS NULL OR timer_duration_minutes > 0
        ) NOT VALID,
    ADD CONSTRAINT steps_sort_order_nonnegative
        CHECK (sort_order >= 0) NOT VALID;

CREATE OR REPLACE FUNCTION validate_completed_recipe_import()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
    v_title TEXT;
    v_ingredient_count INTEGER;
    v_step_count INTEGER;
BEGIN
    IF NEW.recipe_id IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'completed import must reference a recipe';
    END IF;

    SELECT
        recipes.title,
        (
            SELECT count(*)::INTEGER
            FROM ingredients
            WHERE ingredients.recipe_id = recipes.id
        ),
        (
            SELECT count(*)::INTEGER
            FROM steps
            WHERE steps.recipe_id = recipes.id
        )
    INTO v_title, v_ingredient_count, v_step_count
    FROM recipes
    WHERE recipes.id = NEW.recipe_id
      AND recipes.user_id = NEW.user_id;

    IF NOT FOUND OR NULLIF(btrim(v_title), '') IS NULL THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'completed import must reference a valid owned recipe';
    END IF;
    IF v_ingredient_count < 1 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'completed import recipe must contain ingredients';
    END IF;
    IF v_step_count < 1 THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            MESSAGE = 'completed import recipe must contain steps';
    END IF;

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER validate_completed_recipe_import
    AFTER INSERT OR UPDATE OF status, recipe_id
    ON recipe_import_jobs
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW
    WHEN (NEW.status = 'completed')
EXECUTE FUNCTION validate_completed_recipe_import();
