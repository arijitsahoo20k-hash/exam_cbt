-- ============================================================
-- NexusExam — Supabase Database Schema v2
-- Run this entire file in your Supabase SQL Editor
-- ============================================================

-- ── Users (extends auth.users) ──────────────────────────────
CREATE TABLE IF NOT EXISTS public.users (
  id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name       TEXT,
  email      TEXT UNIQUE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read own profile"   ON public.users FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);

-- Auto-create user record on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email, name)
  VALUES (NEW.id, NEW.email, COALESCE(NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ── Attempts ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.attempts (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_name   TEXT NOT NULL DEFAULT 'Exam',
  score       INTEGER NOT NULL DEFAULT 0,
  max_score   INTEGER NOT NULL DEFAULT 0,
  correct     INTEGER NOT NULL DEFAULT 0,
  wrong       INTEGER NOT NULL DEFAULT 0,
  unattempted INTEGER NOT NULL DEFAULT 0,
  accuracy    INTEGER NOT NULL DEFAULT 0,
  time_taken  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own attempts" ON public.attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own attempts"   ON public.attempts FOR SELECT USING (auth.uid() = user_id);

-- ── Responses (per-question answers) ────────────────────────
CREATE TABLE IF NOT EXISTS public.responses (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id  UUID REFERENCES public.attempts(id) ON DELETE CASCADE,
  user_id     UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  question_no INTEGER NOT NULL,
  subject     TEXT,
  answer      TEXT,       -- user's answer: 'A'|'B'|'C'|'D'|null
  correct_ans TEXT,       -- correct answer: 'A'|'B'|'C'|'D'|null
  is_correct  BOOLEAN,    -- null if unattempted
  status      TEXT,       -- answered|not-answered|marked|not-visited|marked-answered
  created_at  TIMESTAMPTZ DEFAULT NOW()
);
ALTER TABLE public.responses ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can insert own responses" ON public.responses FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can read own responses"   ON public.responses FOR SELECT USING (auth.uid() = user_id);

-- ── Indexes ───────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS idx_attempts_user_id    ON public.attempts(user_id);
CREATE INDEX IF NOT EXISTS idx_attempts_created_at ON public.attempts(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_responses_attempt   ON public.responses(attempt_id);
CREATE INDEX IF NOT EXISTS idx_responses_user      ON public.responses(user_id);

SELECT 'NexusExam schema v2 created successfully' AS result;
