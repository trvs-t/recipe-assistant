-- Schedule the durable import worker as a recovery path.
-- Secret values are intentionally resolved from Vault by the cron command at
-- execution time; no secret value is stored in this migration or cron job.

CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

DO $migration$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM cron.job
        WHERE jobname = 'recipe-import-v2-worker-recovery'
    ) THEN
        PERFORM cron.schedule(
            'recipe-import-v2-worker-recovery',
            '* * * * *',
            $cron$
            WITH vault_values AS (
                SELECT
                    (
                        SELECT decrypted_secret
                        FROM vault.decrypted_secrets
                        WHERE name = 'project_url'
                    ) AS project_url,
                    (
                        SELECT decrypted_secret
                        FROM vault.decrypted_secrets
                        WHERE name = 'import_worker_secret'
                    ) AS import_worker_secret
            )
            SELECT CASE
                WHEN NULLIF(btrim(project_url), '') IS NULL
                  OR NULLIF(btrim(import_worker_secret), '') IS NULL
                  OR btrim(project_url) !~* '^https?://[^[:space:]/]+(/.*)?$'
                THEN NULL::BIGINT
                ELSE net.http_post(
                    url := rtrim(btrim(project_url), '/') ||
                        '/functions/v1/import-recipe-v2?action=worker',
                    headers := jsonb_build_object(
                        'Content-Type', 'application/json',
                        'x-import-worker-secret', btrim(import_worker_secret)
                    ),
                    body := '{}'::JSONB,
                    timeout_milliseconds := 120000
                )
            END AS request_id
            FROM vault_values;
            $cron$
        );
    END IF;
END;
$migration$;
