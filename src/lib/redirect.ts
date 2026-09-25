// Post-sign-in destinations and pending invitations (audit S1-H6).

/** Only same-site paths: "/x" but not "//evil.com" or "/\evil.com". */
export function safeNext(next: string | null | undefined): string | null {
  if (!next || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  return next;
}

// An invite link opened while signed out is remembered here, so the token
// survives sign-up and email confirmation even if the confirmation link
// lands on the site root.
const PENDING_INVITE = 'fp.pendingInvite';

export function rememberInvite(token: string | null) {
  if (!token) return;
  try {
    localStorage.setItem(PENDING_INVITE, token);
  } catch {
    /* storage unavailable: the ?next= link still carries the token */
  }
}

export function pendingInvite(): string | null {
  try {
    return localStorage.getItem(PENDING_INVITE);
  } catch {
    return null;
  }
}

export function forgetInvite() {
  try {
    localStorage.removeItem(PENDING_INVITE);
  } catch {
    /* ignore */
  }
}

// A join link (0082) opened while signed out, kept the same way as invites:
// onboarding offers to finish joining instead of creating a new organisation.
const PENDING_JOIN = 'fp.pendingJoin';

export function rememberJoin(token: string) {
  try {
    localStorage.setItem(PENDING_JOIN, token);
  } catch {
    /* storage unavailable: the ?next= link still carries the token */
  }
}

export function pendingJoin(): string | null {
  try {
    return localStorage.getItem(PENDING_JOIN);
  } catch {
    return null;
  }
}

export function forgetJoin() {
  try {
    localStorage.removeItem(PENDING_JOIN);
  } catch {
    /* ignore */
  }
}
