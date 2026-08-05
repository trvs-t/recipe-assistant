-- RLS policies decide which user-owned rows are visible. These table grants
-- allow authenticated web clients to issue those reads and allow the durable
-- worker's service-role client to update import stages directly.

GRANT SELECT ON TABLE
    recipes,
    ingredients,
    steps,
    recipe_import_jobs,
    recipe_import_attempts
TO authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE
    recipes,
    ingredients,
    steps,
    recipe_import_jobs,
    recipe_import_attempts
TO service_role;
