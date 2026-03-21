# Daily Email Setup

## 1. Get a Resend API Key
Sign up at https://resend.com (free tier: 3,000 emails/month).
Verify your domain `pickasyde.com` in Resend → Domains.

## 2. Add the secret in Supabase Dashboard
Go to: Edge Functions → Secrets → Add:
- Name: `RESEND_API_KEY`
- Value: your key from Resend (starts with `re_...`)

The following are already set automatically:
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

## 3. Deploy the function via CLI
```bash
cd versus-app
npx supabase login          # one-time
npx supabase link --project-ref sgpjuwnxxtwprsulfecq
npx supabase functions deploy daily-email --no-verify-jwt
```

## 4. Set up the cron schedule (9:30 AM EST = 13:30 UTC)
In Supabase → SQL Editor, run:

```sql
-- Enable extensions (if not already)
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- Schedule daily debate email at 9:30 AM EST (13:30 UTC)
select cron.schedule(
  'daily-debate-email',
  '30 13 * * *',
  $$
  select net.http_post(
    url := 'https://sgpjuwnxxtwprsulfecq.supabase.co/functions/v1/daily-email',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || current_setting('app.service_role_key', true),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);
```

## 5. Test it manually
In Supabase → Edge Functions → daily-email → Test, send an empty POST body `{}`.
Check the Logs tab to see results.
