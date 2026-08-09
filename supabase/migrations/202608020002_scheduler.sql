create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Supabase Vault에 먼저 다음 두 secret을 저장합니다.
-- select vault.create_secret('https://your-app.vercel.app', 'app_url');
-- select vault.create_secret('replace-with-cron-secret', 'cron_secret');

select cron.schedule(
  'custom-newspaper-generate-daily',
  '45 21 * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/generate-daily',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);

select cron.schedule(
  'custom-newspaper-send-due',
  '*/10 * * * *',
  $$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'app_url') || '/api/jobs/send-due',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{}'::jsonb
  );
  $$
);
