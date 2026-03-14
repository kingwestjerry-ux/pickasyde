-- ============================================================
-- Pick A Syde — AI Persona Accounts
-- Run this in Supabase SQL Editor AFTER supabase_migration_v1.sql
-- Creates 8 AI seed users + their profiles
-- ============================================================

-- Step 1: Insert into auth.users (Supabase allows this via SQL editor as superuser)
INSERT INTO auth.users (
  id, instance_id, aud, role, email, encrypted_password,
  email_confirmed_at, created_at, updated_at,
  raw_app_meta_data, raw_user_meta_data, is_super_admin, confirmation_token
) VALUES
  ('a1000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.marcus@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.priya@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.tyrell@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.sofia@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000005', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.derek@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000006', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.anika@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000007', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.josh@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, ''),

  ('a1000000-0000-0000-0000-000000000008', '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated',
   'persona.chloe@pickasyde.internal', '', NOW(), NOW(), NOW(),
   '{"provider":"email","providers":["email"]}', '{}', false, '')

ON CONFLICT (id) DO NOTHING;

-- Step 2: Insert into user_profiles
INSERT INTO public.user_profiles (id, display_name, is_ai_seed, current_streak, longest_streak)
VALUES
  ('a1000000-0000-0000-0000-000000000001', 'Marcus T.',   true, 0, 0),
  ('a1000000-0000-0000-0000-000000000002', 'Priya R.',    true, 0, 0),
  ('a1000000-0000-0000-0000-000000000003', 'Tyrell W.',   true, 0, 0),
  ('a1000000-0000-0000-0000-000000000004', 'Sofia M.',    true, 0, 0),
  ('a1000000-0000-0000-0000-000000000005', 'Derek C.',    true, 0, 0),
  ('a1000000-0000-0000-0000-000000000006', 'Anika J.',    true, 0, 0),
  ('a1000000-0000-0000-0000-000000000007', 'Josh K.',     true, 0, 0),
  ('a1000000-0000-0000-0000-000000000008', 'Chloe B.',    true, 0, 0)
ON CONFLICT (id) DO UPDATE SET is_ai_seed = true;

-- Verify
SELECT id, display_name, is_ai_seed FROM public.user_profiles WHERE is_ai_seed = true;
