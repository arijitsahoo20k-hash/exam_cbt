/**
 * auth.js — Authentication logic
 *
 * FIXES:
 *  - LocalAuth fallback: when Supabase is not configured, login/register works
 *    entirely via localStorage so history is always available for signed-in users.
 *  - setUser() correctly handles null/undefined without defaulting to "Guest"
 *  - Guest mode is explicitly labelled so history is skipped only for true guests
 */

// ── Local-only auth (no Supabase needed) ───────────────────
const LocalAuth = (() => {
  const USERS_KEY   = 'examcbt_local_users';
  const SESSION_KEY = 'sb_user';

  function _hashPass(pass) {
    // Simple deterministic hash — not cryptographic, but prevents plain-text storage
    let h = 0;
    for (let i = 0; i < pass.length; i++) {
      h = Math.imul(31, h) + pass.charCodeAt(i) | 0;
    }
    return h.toString(36);
  }

  function _getUsers() {
    try { return JSON.parse(localStorage.getItem(USERS_KEY) || '[]'); } catch { return []; }
  }

  function register(name, email, pass) {
    const users = _getUsers();
    if (users.find(u => u.email.toLowerCase() === email.toLowerCase())) {
      throw new Error('An account with this email already exists.');
    }
    const user = {
      id:        'local_' + Date.now() + '_' + Math.random().toString(36).slice(2),
      name, email,
      passHash:  _hashPass(pass),
      isGuest:   false,
      created_at: new Date().toISOString(),
    };
    users.push(user);
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
    const session = { id: user.id, name: user.name, email: user.email, isGuest: false };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  function login(email, pass) {
    const users = _getUsers();
    const user  = users.find(u => u.email.toLowerCase() === email.toLowerCase());
    if (!user) throw new Error('No account found with this email. Please register first.');
    if (user.passHash !== _hashPass(pass)) throw new Error('Incorrect password.');
    const session = { id: user.id, name: user.name, email: user.email, isGuest: false };
    localStorage.setItem(SESSION_KEY, JSON.stringify(session));
    return session;
  }

  return { register, login };
})();

// ── Main Auth module ────────────────────────────────────────
const Auth = (() => {
  let _user = null;

  function getUser() { return _user; }

  function setUser(u) {
    _user = u;
    const name = u?.name || u?.email || 'Guest';
    const els = {
      'dash-username': name,
      'sidebar-name':  name,
      'exam-candidate': name,
    };
    for (const [id, val] of Object.entries(els)) {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    }
    const avEl = document.getElementById('sidebar-avatar');
    if (avEl) avEl.textContent = (name[0] || 'G').toUpperCase();
  }

  function init() {
    const user = SupabaseClient.restoreSession();
    if (user) {
      setUser(user);
      return user;
    }
    return null;
  }

  function bindEvents() {
    // Tab switching
    document.querySelectorAll('.auth-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.auth-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.auth-form').forEach(f => f.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`form-${tab.dataset.tab}`).classList.add('active');
      });
    });

    // ── Login ──────────────────────────────────────────────────
    document.getElementById('btn-login')?.addEventListener('click', async () => {
      const email = document.getElementById('login-email').value.trim();
      const pass  = document.getElementById('login-password').value;
      const errEl = document.getElementById('login-error');
      errEl.textContent = '';

      if (!email || !pass) { errEl.textContent = 'Please fill all fields.'; return; }

      const btn = document.getElementById('btn-login');
      btn.textContent = 'Signing in…'; btn.disabled = true;

      try {
        let u;
        if (SupabaseClient.isConfigured()) {
          // Cloud login via Supabase
          await SupabaseClient.signIn(email, pass);
          u = SupabaseClient.getCurrentUser();
          if (!u) throw new Error('Sign-in succeeded but user data was not returned. Check your Supabase project.');
        } else {
          // Local login fallback — works fully offline, history saved on this device
          u = LocalAuth.login(email, pass);
        }
        setUser(u);
        UI.showScreen('dashboard');
        Toast.show('Welcome back, ' + u.name + '!', 'success');
        document.dispatchEvent(new CustomEvent('auth:login', { detail: u }));
      } catch (e) {
        errEl.textContent = e.message || 'Login failed.';
      } finally {
        btn.textContent = 'Sign In'; btn.disabled = false;
      }
    });

    // ── Register ───────────────────────────────────────────────
    document.getElementById('btn-register')?.addEventListener('click', async () => {
      const name  = document.getElementById('reg-name').value.trim();
      const email = document.getElementById('reg-email').value.trim();
      const pass  = document.getElementById('reg-password').value;
      const errEl = document.getElementById('reg-error');
      errEl.textContent = '';

      if (!name || !email || !pass) { errEl.textContent = 'Please fill all fields.'; return; }
      if (pass.length < 8) { errEl.textContent = 'Password must be 8+ characters.'; return; }

      const btn = document.getElementById('btn-register');
      btn.textContent = 'Creating account…'; btn.disabled = true;

      try {
        let u;
        if (SupabaseClient.isConfigured()) {
          // Cloud registration via Supabase
          await SupabaseClient.signUp(email, pass, name);
          u = SupabaseClient.getCurrentUser();
          if (!u) throw new Error('Account created but user data was not returned. Check your Supabase project.');
        } else {
          // Local registration fallback — no cloud needed, history stored on this device
          u = LocalAuth.register(name, email, pass);
        }
        setUser(u);
        UI.showScreen('dashboard');
        Toast.show('Account created! Welcome, ' + u.name + '!', 'success');
        document.dispatchEvent(new CustomEvent('auth:login', { detail: u }));
      } catch (e) {
        errEl.textContent = e.message || 'Registration failed.';
      } finally {
        btn.textContent = 'Create Account'; btn.disabled = false;
      }
    });

    // ── Guest ──────────────────────────────────────────────────
    document.getElementById('btn-guest')?.addEventListener('click', () => {
      // Fully clear any previous session before going guest
      SupabaseClient.signOut();
      _user = null;
      const guest = { id: 'guest_' + Date.now(), name: 'Guest', email: 'guest@local', isGuest: true };
      localStorage.setItem('sb_user', JSON.stringify(guest));
      setUser(guest);
      UI.showScreen('dashboard');
      Toast.show('Continuing as Guest — history is disabled', 'info');
    });

    // ── Logout ─────────────────────────────────────────────────
    document.getElementById('btn-logout')?.addEventListener('click', () => {
      SupabaseClient.signOut();
      _user = null;
      UI.showScreen('auth');
      Toast.show('Signed out');
    });
  }

  return { init, getUser, setUser, bindEvents };
})();
