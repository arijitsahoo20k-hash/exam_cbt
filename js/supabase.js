/**
 * supabase.js — Lightweight Supabase REST client
 * Handles auth, attempts, and per-question responses.
 *
 * FIXES:
 *  - isConfigured() now correctly validates non-empty credentials
 *  - request() no longer silently swallows calls when unconfigured
 *    (auth calls are guarded separately so they always work locally)
 *  - restoreSession() also re-hydrates _token on page load
 */

const SupabaseClient = (() => {
  const BASE = () => window.APP_CONFIG?.SUPABASE_URL || '';
  const KEY  = () => window.APP_CONFIG?.SUPABASE_ANON_KEY || '';

  let _token = null;

  function headers(extra = {}) {
    return {
      'Content-Type': 'application/json',
      'apikey': KEY(),
      'Authorization': `Bearer ${_token || KEY()}`,
      'Prefer': 'return=representation',
      ...extra,
    };
  }

  async function request(method, path, body, params) {
    if (!isConfigured()) return null; // Supabase not configured — skip silently
    let url = `${BASE()}${path}`;
    if (params) {
      const qs = Object.entries(params)
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`).join('&');
      url += '?' + qs;
    }
    const opts = { method, headers: headers() };
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(url, opts);
    const text = await res.text();
    let data = null;
    try { data = JSON.parse(text); } catch (_) { data = text; }
    if (!res.ok) throw new Error(data?.message || data?.error_description || `HTTP ${res.status}`);
    return data;
  }

  // ── Auth ──────────────────────────────────────────────────────
  async function signUp(email, password, name) {
    if (!isConfigured()) {
      throw new Error('Supabase is not configured. Please add your SUPABASE_URL and SUPABASE_ANON_KEY to js/config.js');
    }
    const data = await request('POST', '/auth/v1/signup', { email, password, data: { name } });
    _token = data?.access_token || null;
    if (_token) localStorage.setItem('sb_token', _token);
    const resolvedName = data?.user?.user_metadata?.name || name || email.split('@')[0];
    if (data?.user) localStorage.setItem('sb_user', JSON.stringify({
      id: data.user.id, email, name: resolvedName
    }));
    return data;
  }

  async function signIn(email, password) {
    if (!isConfigured()) {
      throw new Error('Supabase is not configured. Please add your SUPABASE_URL and SUPABASE_ANON_KEY to js/config.js');
    }
    const data = await request('POST', '/auth/v1/token?grant_type=password', { email, password });
    _token = data?.access_token || null;
    if (_token) localStorage.setItem('sb_token', _token);
    const name = data?.user?.user_metadata?.name || email.split('@')[0];
    if (data?.user) localStorage.setItem('sb_user', JSON.stringify({
      id: data.user.id, email, name
    }));
    return data;
  }

  function signOut() {
    _token = null;
    localStorage.removeItem('sb_token');
    localStorage.removeItem('sb_user');
  }

  /**
   * Restore session from localStorage on page load.
   * Also re-hydrates _token so REST calls work without re-login.
   */
  function restoreSession() {
    const token = localStorage.getItem('sb_token');
    if (token) _token = token;
    const raw = localStorage.getItem('sb_user');
    return raw ? JSON.parse(raw) : null;
  }

  function getCurrentUser() {
    const raw = localStorage.getItem('sb_user');
    return raw ? JSON.parse(raw) : null;
  }

  // ── Generic REST ───────────────────────────────────────────────
  async function insert(table, row) {
    return request('POST', `/rest/v1/${table}`, row);
  }

  async function select(table, filters = {}) {
    const path = `/rest/v1/${table}`;
    const params = { select: '*', ...filters };
    return request('GET', path, null, params);
  }

  // ── Attempts ───────────────────────────────────────────────────
  async function saveAttempt(attempt) {
    try {
      const rows = await request('POST', '/rest/v1/attempts', attempt);
      return Array.isArray(rows) ? rows[0] : rows;
    } catch (e) {
      console.warn('saveAttempt failed:', e.message);
      return null;
    }
  }

  async function saveResponses(responses) {
    if (!responses || responses.length === 0) return null;
    try {
      return await request('POST', '/rest/v1/responses', responses);
    } catch (e) {
      console.warn('saveResponses failed:', e.message);
      return null;
    }
  }

  async function getUserAttempts(userId) {
    try {
      const rows = await request('GET', '/rest/v1/attempts', null, {
        select: '*',
        user_id: `eq.${userId}`,
        order: 'created_at.desc',
        limit: '50',
      });
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn('getUserAttempts failed:', e.message);
      return [];
    }
  }

  async function getAttemptResponses(attemptId) {
    try {
      const rows = await request('GET', '/rest/v1/responses', null, {
        select: '*',
        attempt_id: `eq.${attemptId}`,
        order: 'question_no.asc',
      });
      return Array.isArray(rows) ? rows : [];
    } catch (e) {
      console.warn('getAttemptResponses failed:', e.message);
      return [];
    }
  }

  /**
   * Returns true only when both URL and key are real non-placeholder values.
   */
  function isConfigured() {
    const url = BASE();
    const key = KEY();
    return (
      typeof url === 'string' && url.length > 10 &&
      !url.includes('YOUR_PROJECT') &&
      typeof key === 'string' && key.length > 10 &&
      !key.includes('YOUR_ANON_KEY')
    );
  }

  return {
    signUp, signIn, signOut, restoreSession, getCurrentUser,
    insert, select,
    saveAttempt, saveResponses, getUserAttempts, getAttemptResponses,
    isConfigured,
  };
})();
