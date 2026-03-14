# ⚔️ Pick-A-Syde— Setup Guide

> One question. Two sides. You decide.

This is the complete production setup guide. Follow these steps in order and you'll have a live app in under an hour.

---

## Quick start (after setup)

```bash
cp .env.example .env   # fill in your keys
npm install
npm run dev            # http://localhost:5173
```

---

## Step 1 — Create a Supabase project

1. Go to [supabase.com](https://supabase.com) and create a free account.
2. Click **New project**. Name it `pickasyde`. Choose the region closest to your users.
3. Wait ~2 minutes for the project to spin up.
4. Go to **Settings → API** and copy:
   - **Project URL** → `VITE_SUPABASE_URL`
   - **anon / public key** → `VITE_SUPABASE_ANON_KEY`

---

## Step 2 — Run schema.sql

1. In your Supabase project, go to **Database → SQL Editor → New query**.
2. Paste the entire contents of `schema.sql` into the editor.
3. Click **Run** (or press Cmd/Ctrl+Enter).
4. You should see "Success. No rows returned." for each statement.

This creates: `debates`, `user_profiles`, `votes`, `comments`, `upvotes` tables, all RLS policies, and triggers for streak tracking + upvote counts.

---

## Step 3 — Enable Google OAuth in Supabase

1. Go to **Authentication → Providers → Google**.
2. Toggle **Enable Sign in with Google**.
3. Follow Supabase's guide to create a Google OAuth app in [Google Cloud Console](https://console.cloud.google.com/):
   - Create a project → APIs & Services → Credentials → OAuth 2.0 Client ID
   - Application type: **Web application**
   - Authorized redirect URIs: `https://<your-project-ref>.supabase.co/auth/v1/callback`
4. Copy the **Client ID** and **Client Secret** back into Supabase.
5. Add your production domain to **Authentication → URL Configuration → Redirect URLs**:
   - `http://localhost:5173` (for local dev)
   - `https://your-app.vercel.app` (for production)

Email/password sign-up is enabled by default — no extra setup needed.

---

## Step 4 — Set environment variables

```bash
cp .env.example .env
```

Edit `.env`:

```
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=eyJ...
VITE_ANTHROPIC_API_KEY=sk-ant-...
VITE_APP_URL=https://pickasyde.app
```

Get your Anthropic API key from [console.anthropic.com](https://console.anthropic.com).

---

## Step 5 — Deploy the Edge Function (midnight rotation)

The `close-debate` Edge Function runs at midnight EST, marks the previous day's debate as closed, and locks in the final percentage.

### Install Supabase CLI

```bash
npm install -g supabase
supabase login
```

### Deploy the function

```bash
supabase functions deploy close-debate \
  --project-ref YOUR_PROJECT_REF
```

Find `YOUR_PROJECT_REF` in **Settings → General → Reference ID**.

### Schedule it with pg_cron

In Supabase **Database → SQL Editor**, run:

```sql
-- Enable pg_cron if not already enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Schedule close-debate to run at 5:00 AM UTC = midnight EST
-- Change to '0 4 * * *' in summer (EDT = UTC-4)
SELECT cron.schedule(
  'close-debate-midnight',
  '0 5 * * *',
  $$
    SELECT net.http_post(
      url := 'https://YOUR_PROJECT_REF.supabase.co/functions/v1/close-debate',
      headers := jsonb_build_object(
        'Authorization', 'Bearer YOUR_SERVICE_ROLE_KEY'
      )
    );
  $$
);
```

Find `YOUR_SERVICE_ROLE_KEY` in **Settings → API → service_role** (keep this secret!).

---

## Step 6 — Deploy to Vercel

1. Push your code to a GitHub repository.
2. Go to [vercel.com](https://vercel.com) → New Project → Import from GitHub.
3. Select your repo. Vercel auto-detects Vite.
4. Add environment variables in **Settings → Environment Variables** (same four vars from `.env`).
5. Click **Deploy**.

Your app is live. The build command is `npm run build`, output directory is `dist`.

---

## Step 7 — Add debate questions

pickasyde is content-driven. New debates must be scheduled in advance.

1. Go to Supabase **Table Editor → debates**.
2. Click **Insert row**.
3. Fill in:
   - `date` — YYYY-MM-DD format. Must be a future date (one row per day).
   - `question` — The debate question (e.g. "Is luck random or created?")
   - `label_a` — Short label for Side A (e.g. "CREATED") — uppercase, 1-2 words
   - `label_b` — Short label for Side B (e.g. "RANDOM")
   - `base_seed_a` / `base_seed_b` — Start at `45` each to look populated. Adjust to bias the initial bar.
   - `sponsor_name`, `sponsor_logo_letter`, `sponsor_color`, `sponsor_tagline` — Leave null for unsponsored debates.
4. Click **Save**.

The app fetches today's debate by matching `date = CURRENT_DATE` in EST. If no row exists for today, the app shows a "No debate scheduled" screen.

**Tip:** Batch-insert a month of debates at once using the SQL Editor:

```sql
INSERT INTO debates (date, question, label_a, label_b, base_seed_a, base_seed_b) VALUES
  ('2026-04-01', 'Is AI creative?', 'YES', 'NO', 45, 45),
  ('2026-04-02', 'Remote or office?', 'REMOTE', 'OFFICE', 48, 42),
  ('2026-04-03', 'Is college worth it?', 'WORTH IT', 'NOT WORTH IT', 45, 45);
```

---

## Step 8 — Using the AI seed buttons (admin)

The seed buttons pre-populate new debates with realistic AI-generated comments so they don't look empty on day one.

### Set your admin email

In `src/lib/api.js`, find this line and update it:

```js
const ADMIN_EMAILS = ['admin@pickasyde.app'];
```

Change `admin@pickasyde.app` to your actual sign-in email. The seed buttons are only visible when the logged-in user's email matches this list.

### Set up AI persona accounts

AI seed comments are posted under fake persona accounts. To set these up:

1. In Supabase **SQL Editor**, create auth users for each persona (requires service role — do this once):

```sql
-- You can't directly insert into auth.users from the editor.
-- Instead, sign up each persona via the app with a throwaway email,
-- then mark them as AI seeds:
UPDATE user_profiles
SET display_name = 'Marcus_Delray', is_ai_seed = true
WHERE id = '<uuid-of-marcus-account>';
```

Or use the Supabase service role API to create users programmatically. See [Supabase docs on admin user creation](https://supabase.com/docs/reference/javascript/auth-admin-createuser).

The eight persona names are: `Marcus_Delray`, `jess.thornton`, `RaviK2024`, `claire_pf`, `tommy.brix`, `Denise_O`, `nate_w99`, `priya.s`.

Once `is_ai_seed = true` is set on their profiles, the app will pick a random one when seeding.

### Using the seed buttons

1. Log in as your admin email.
2. Go to Today's debate.
3. The `🤖 Seed: [LABEL A]` and `🤖 Seed: [LABEL B]` buttons appear below the comment box.
4. Click either to generate and post one AI comment for that side.
5. Repeat a few times for each side to populate the debate before it goes public.

---

## Architecture overview

```
Browser (React + Vite)
    ↕ Supabase JS SDK (HTTPS + WebSockets)
Supabase (PostgreSQL + Auth + Realtime + Edge Functions)
    ↕ pg_cron (midnight trigger)
Supabase Edge Function (close-debate)
    ↕ Anthropic API (moderation + seed generation — client-side in v1)
```

### Real-time flow

- On Today screen mount: subscribe to `postgres_changes` INSERT on `comments` filtered by `debate_id`.
- New comments from other users appear instantly without a page refresh.
- Upvote counts update via an UPDATE subscription on `comments`.
- Both channels unsubscribe on component unmount.

### Vote bar calculation (live debates)

```
boost_a = count of Side A comments with upvote_count >= 5 * 0.5
boost_b = count of Side B comments with upvote_count >= 5 * 0.5
total_a = (live_vote_count_a + base_seed_a) + boost_a + (1 if user voted A)
total_b = (live_vote_count_b + base_seed_b) + boost_b + (1 if user voted B)
pct_a   = round(total_a / (total_a + total_b) * 100)
```

For closed debates, `final_pct_a` is used directly (set by the Edge Function).

---

## Build agent decisions

These are design choices made during build that weren't explicitly specified:

1. **`main.jsx` entry point** — Added `src/main.jsx` as the Vite entry point (renders `<App />` into `#root`). The spec only mentioned `index.html` but a separate entry file is standard Vite practice.

2. **Vote bar uses live vote counts + base seeds** — The spec described `base_seed_a/b` as per-debate DB values. The live bar now sums actual DB vote counts + base seeds + boosts, so the bar accurately reflects real user votes as they accumulate. The base seeds make day-one debates look populated even before real votes come in.

3. **`changeVote` clears vote client-side before re-voting** — When a user clicks "change", the client sets `userVote = null` so the vote buttons re-appear. Under the hood the existing vote row is updated (not deleted + re-inserted) to preserve vote history and avoid double-trigger of the streak function.

4. **Streak trigger only fires on INSERT** — The `update_streak_on_vote` trigger runs on vote INSERT only, not UPDATE. A vote change on the same debate does not advance the streak (correct behavior: one streak increment per debate per user).

5. **Archive loads lazily** — `getArchive()` is only called when the user navigates to the Archive screen for the first time, then cached in React state. This avoids loading potentially large archive data on every app mount.

6. **Sign out on avatar tap** — The header avatar is a tap target for sign out. In a v2, this would open a profile dropdown. For v1 it's a clean escape hatch.

7. **`final_pct_a` shows A winning** — The yesterday's banner always shows Side A's percentage and declares Side A the winner. This was not specified; a future improvement would compare `final_pct_a` to 50 and show the actual winning side's label and color.

8. **Anthropic model** — Using `claude-haiku-4-5-20251001` for both moderation and seed generation. It's fast and cheap for these short tasks. Upgrade to Sonnet for higher-quality seed comments if desired.

9. **RLS on debates table** — The spec didn't explicitly define RLS for the debates table. Added: public SELECT (anyone can read debates), service_role-only INSERT/UPDATE (debates are managed by admins and the Edge Function, never by end users).

10. **`anthropic-dangerous-direct-browser-access` header** — Required by Anthropic for client-side API calls. The comment in `moderation.js` documents that this should move server-side in v2.

---

## Troubleshooting

**"Missing Supabase environment variables"** — Make sure `.env` exists and contains `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`. Restart `npm run dev` after changing `.env`.

**Google OAuth redirect loop** — Make sure `http://localhost:5173` is in your Supabase Auth redirect URLs (Authentication → URL Configuration).

**Comments not appearing in real-time** — Check that Supabase Realtime is enabled for the `comments` table: Database → Replication → Enable Realtime for `comments`.

**Edge Function 401** — Make sure you're passing the `service_role` key (not the `anon` key) in the Authorization header of the cron job.

**"No debate scheduled for today"** — Insert a row into the `debates` table for today's date (YYYY-MM-DD in EST). See Step 7.

---

## v2 roadmap

- Move Anthropic API calls to Supabase Edge Function (keep key server-side)
- Loops.so integration for "your side is losing" push emails
- Demographic vote breakdown (age, location via optional profile fields)
- Leaderboard of top commenters
- Admin dashboard UI (manage debates without SQL Editor)
- Mobile app (React Native)
