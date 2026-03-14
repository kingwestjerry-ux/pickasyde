-- ============================================================
-- Pick A Syde — Seed: First 10 Debate Questions
-- Trending & timely topics for March–April 2026 launch
-- Run in Supabase SQL Editor
-- IMPORTANT: Update the dates to match your actual launch schedule.
-- ============================================================

-- Replace '2026-03-15' with your real launch date and increment by 1 day each row.
INSERT INTO public.debates (question, date, label_a, label_b, is_closed)
VALUES
  -- Day 1: AI in the workplace — huge conversation right now
  ('Should AI be allowed to replace human jobs?',
   '2026-03-15', 'Yes, progress wins', 'No, protect workers', false),

  -- Day 2: Remote vs office — still the most-debated work topic
  ('Remote work or back to the office?',
   '2026-03-16', 'Remote forever', 'Office life wins', false),

  -- Day 3: Social media age restrictions — viral debate in 2026
  ('Should social media be banned for under-16s?',
   '2026-03-17', 'Yes, protect kids', 'No, it''s their right', false),

  -- Day 4: 4-day work week — trending globally
  ('4-day work week: good idea or productivity killer?',
   '2026-03-18', 'Yes, do it', 'No, stay at 5', false),

  -- Day 5: AI-generated art — culture wars topic
  ('Is AI-generated art "real" art?',
   '2026-03-19', 'Yes, art is art', 'No, it''s just code', false),

  -- Day 6: iPhone vs Android — timeless crowd pleaser
  ('iPhone or Android?',
   '2026-03-20', 'iPhone all day', 'Android is better', false),

  -- Day 7: Student loan forgiveness — still divisive
  ('Should student loan debt be forgiven?',
   '2026-03-21', 'Yes, cancel it', 'No, pay what you owe', false),

  -- Day 8: Side hustles — Gen Z / millennial obsession
  ('Is having a side hustle necessary in 2026?',
   '2026-03-22', 'Absolutely yes', 'One job is enough', false),

  -- Day 9: Tipping culture — hot topic in restaurants/apps
  ('Has tipping culture gone too far?',
   '2026-03-23', 'Yes, it''s out of hand', 'No, tip your people', false),

  -- Day 10: Crypto / digital money — renewed conversation
  ('Will crypto eventually replace cash?',
   '2026-03-24', 'Yes, inevitable', 'No, cash is king', false)

ON CONFLICT (date) DO NOTHING;

-- Verify
SELECT id, date, question, label_a, label_b FROM public.debates
WHERE date >= '2026-03-15'
ORDER BY date ASC;
