// "Keep me logged in". Supabase keeps the session in localStorage, which
// survives closing the browser. When the box is unticked we mark the session
// as short-lived and drop a browser-session cookie (no expiry: shared by all
// tabs, gone when the browser closes). On the next start, a short-lived
// session without the cookie is signed out.

const FLAG = 'fp.ephemeralSession';
const COOKIE = 'fp_session_alive';

function setCookie() {
  const secure = location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${COOKIE}=1; path=/; SameSite=Lax${secure}`;
}

function hasCookie() {
  return document.cookie.split('; ').some((c) => c.startsWith(`${COOKIE}=`));
}

export function rememberSession(keep: boolean) {
  try {
    if (keep) {
      localStorage.removeItem(FLAG);
    } else {
      localStorage.setItem(FLAG, '1');
      setCookie();
    }
  } catch {
    /* storage unavailable: the session simply persists */
  }
}

/** True when a "don't keep me logged in" session outlived its browser session. */
export function sessionExpiredOnRestart(): boolean {
  try {
    return localStorage.getItem(FLAG) === '1' && !hasCookie();
  } catch {
    return false;
  }
}

export function forgetSessionPreference() {
  try {
    localStorage.removeItem(FLAG);
  } catch {
    /* ignore */
  }
}
