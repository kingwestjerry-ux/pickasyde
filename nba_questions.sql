-- NBA Debates for March 21-27, 2026
INSERT INTO public.debates (question, label_a, label_b, date, base_seed_a, base_seed_b, is_closed, created_at)
VALUES
  ('Who is the greatest NBA player of all time?', 'LeBron James', 'Michael Jordan', '2026-03-21', 48, 52, false, now()),
  ('Best NBA dynasty ever?', 'Bulls 90s', 'Warriors 2015-2019', '2026-03-22', 44, 56, false, now()),
  ('Kobe or Shaq — who was more essential to the Lakers 3-peat?', 'Kobe Bryant', 'Shaq O''Neal', '2026-03-23', 52, 48, false, now()),
  ('Greatest NBA Finals performance ever?', 'LeBron''s 2016 Game 7', 'Jordan''s 1998 Last Shot', '2026-03-24', 46, 54, false, now()),
  ('Who deserved the 2016 Finals MVP more?', 'LeBron James', 'Kyrie Irving', '2026-03-25', 61, 39, false, now()),
  ('Best point guard of the past 20 years?', 'Stephen Curry', 'Chris Paul', '2026-03-26', 72, 28, false, now()),
  ('Was the 2004 US Olympic team the biggest upset in basketball history?', 'Yes, total embarrassment', 'No, global game had caught up', '2026-03-27', 55, 45, false, now())
ON CONFLICT DO NOTHING;
