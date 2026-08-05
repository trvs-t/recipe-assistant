-- Dev user for local development
-- Login: dev@example.com / devpassword123
INSERT INTO auth.users (
  instance_id,
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at,
  confirmation_token,
  email_change,
  email_change_token_new,
  recovery_token
) VALUES (
  '00000000-0000-0000-0000-000000000000',
  '00000000-0000-0000-0000-000000000001',
  'authenticated',
  'authenticated',
  'dev@example.com',
  crypt('devpassword123', gen_salt('bf')),
  NOW(),
  '{"provider":"email","providers":["email"]}',
  '{"full_name":"Dev User"}',
  NOW(),
  NOW(),
  '',
  '',
  '',
  ''
)
ON CONFLICT (id) DO NOTHING;

-- Local pg_cron recovery for durable imports. The public submission performs a
-- best-effort immediate worker kick; this internal URL and local-only secret
-- ensure retry_wait jobs are claimed again without manual intervention.
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'project_url'
  ) THEN
    PERFORM vault.create_secret(
      'http://kong:8000',
      'project_url',
      'Local Recipe Assistant Edge Function base URL'
    );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM vault.decrypted_secrets WHERE name = 'import_worker_secret'
  ) THEN
    PERFORM vault.create_secret(
      'recipe-assistant-local-worker-only',
      'import_worker_secret',
      'Local Recipe Assistant import worker secret'
    );
  END IF;
END;
$$;
