/**
 * config.js — App configuration
 *
 * ──────────────────────────────────────────────────────────────
 *  HOW TO SET UP SUPABASE (required for history & review):
 *
 *  1. Go to https://supabase.com → your project → Settings → API
 *  2. Copy "Project URL"  → paste as SUPABASE_URL below
 *  3. Copy "anon / public" key → paste as SUPABASE_ANON_KEY below
 *  4. Run supabase-schema.sql in your Supabase SQL Editor (once)
 *
 *  For Vercel: set SUPABASE_URL and SUPABASE_ANON_KEY as
 *  Environment Variables and the __ENV_* placeholders are
 *  injected automatically via vercel.json rewrites.
 * ──────────────────────────────────────────────────────────────
 */

window.APP_CONFIG = {
  // ── Supabase ────────────────────────────────────────────────
  // Replace these with your actual values from supabase.com → Settings → API
  SUPABASE_URL:      window.__ENV_SUPABASE_URL__      || 'https://zwhyftwynrdhxmdmxohg.supabase.co',
  SUPABASE_ANON_KEY: window.__ENV_SUPABASE_ANON_KEY__ || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inp3aHlmdHd5bnJkaHhtZG14b2hnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY3MDI4MzMsImV4cCI6MjA5MjI3ODgzM30.X57wBh_Nm5-ymZteo-_3ZLglp6yheh-fwrLDYmc22jI',

  // ── Exam Defaults ────────────────────────────────────────────
  EXAM_DURATION_SECONDS: 3 * 60 * 60,   // 3 hours
  MARKS_CORRECT:   3,
  MARKS_WRONG:    -1,
  MARKS_UNATTEMPTED: 0,

  // ── Version ──────────────────────────────────────────────────
  VERSION: '1.0.0',
};
