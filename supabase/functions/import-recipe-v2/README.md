# Recipe import v2

This function has two explicit POST actions:

- `POST /functions/v1/import-recipe-v2` accepts a Supabase Auth bearer token and
  `{ "sourceUrl": "https://...", "idempotencyKey": "..." }`. It validates the
  request, calls the URL-or-text enqueue RPC, and returns `202`; it never fetches or
  parses the source inline.
- `POST /functions/v1/import-recipe-v2?action=worker` is for the durable worker.
  It requires `x-import-worker-secret: $IMPORT_WORKER_SECRET`, claims at most
  one queue message, processes one attempt, and returns `204` when the queue is
  empty or the attempt has been durably finalized.

When a normalized recipe has no trustworthy ingredient links, the worker first
applies deterministic text matching and then makes one bounded OpenRouter
linking pass for unresolved references. Only known ingredient IDs and links at
or above the confidence threshold are persisted; otherwise the linear flow
fallback remains in place.

When Supabase `EdgeRuntime.waitUntil` is available, a newly queued submission
also schedules one best-effort worker claim before returning `202`. This is a
latency shortcut only: failure to start or finish that background task leaves
the queue message available for the scheduled recovery path below.

Required deployment configuration:

```text
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
IMPORT_WORKER_SECRET=...
OPENROUTER_API_KEY=...
```

`deepseek/deepseek-v4-flash` is pinned in `openrouter-normalizer.ts`. Model
changes must be reviewed, tested against the import corpus, and deployed with
the function rather than changed through hosted runtime configuration.

The worker's queue visibility lease and the SQL RPC transitions are the
durability boundary; completion is never delegated to a background callback.

## Scheduled recovery

The migration after the queue migration creates one stable pg_cron job named
`recipe-import-v2-worker-recovery`. It runs every minute and queues an async
`pg_net` POST to:

```text
/functions/v1/import-recipe-v2?action=worker
```

Each cron run reads `project_url` and `import_worker_secret` from
`vault.decrypted_secrets`. The migration stores neither value in SQL. If either
secret is missing or blank, or `project_url` is not an HTTP(S) URL, the cron
command returns without making an HTTP request. Replaying the migration does not
create a second job with the same name.

### Vault setup

Create these two Supabase Vault secrets once, using the exact names below:

```sql
select vault.create_secret(
  'https://<project-ref>.supabase.co',
  'project_url',
  'Base URL used by the scheduled import-recipe-v2 worker'
);

select vault.create_secret(
  '<generate-a-long-random-worker-secret>',
  'import_worker_secret',
  'Shared secret for the scheduled import-recipe-v2 worker request'
);
```

Replace the placeholders with deployment-specific values; do not commit the
worker secret. The `import_worker_secret` value must be the same value set as
the Edge Function's `IMPORT_WORKER_SECRET` secret. If either named secret
already exists, update it in Supabase Vault instead of creating a duplicate. For
a non-secret configuration check, use:

```sql
select name, length(decrypted_secret) > 0 as configured
from vault.decrypted_secrets
where name in ('project_url', 'import_worker_secret')
order by name;
```

### Edge Function authorization

The cron request intentionally does not include a user JWT or Supabase API key.
The Edge Function must allow the request through the platform JWT gate and
retain its handler-level `x-import-worker-secret` check. Configure the function
with JWT verification disabled, for example in the root `supabase/config.toml`:

```toml
[functions.import-recipe-v2]
verify_jwt = false
```

Then redeploy, or use the equivalent one-off command:

```bash
supabase functions deploy import-recipe-v2 --no-verify-jwt
```

Disabling the platform JWT check is not disabling worker authorization: the
handler must still receive the exact `x-import-worker-secret` header and returns
`401` for a missing or incorrect value. Keep `IMPORT_WORKER_SECRET` configured
in the Edge Function environment and deploy the function before enabling the
schedule.
