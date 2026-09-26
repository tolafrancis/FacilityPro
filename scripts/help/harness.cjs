// Shared header for the help scripts (prepended by run.cjs). Serves the built
// app, signs pages in as demo users with locally signed JWTs, and queries the
// local database. Configure with environment variables:
//   HELP_DIST        built app (default: dist)          — build with VITE_SUPABASE_URL=http://127.0.0.1:54321
//   HELP_JWT_SECRET  the local PostgREST JWT secret     (default: local-test-secret-local-test-secret-32)
//   HELP_PSQL        psql command for the seeded DB      (default: psql -h /var/tmp/fpg -p 5433 -U postgres -d fpseed)
//   HELP_CHROMIUM    Chromium executable (optional)
const { chromium: _chromium } = require('playwright'); const http = require('http'); const fs = require('fs'); const path = require('path');
const crypto = require('crypto'); const { execSync } = require('child_process');
const ROOT = process.env.HELP_ROOT;
const DIST = path.resolve(ROOT, process.env.HELP_DIST || 'dist');
const OUT = path.join(require('os').tmpdir(), 'fp-help-crawl'); fs.mkdirSync(OUT, { recursive: true });
const SECRET = process.env.HELP_JWT_SECRET || 'local-test-secret-local-test-secret-32';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
function jwt(sub) {
  const h = b64({ alg: 'HS256', typ: 'JWT' }), p = b64({ sub, role: 'authenticated', aud: 'authenticated', exp: Math.floor(Date.now() / 1000) + 7200 });
  return `${h}.${p}.${crypto.createHmac('sha256', SECRET).update(`${h}.${p}`).digest('base64url')}`;
}
const chromium = { launch: (o = {}) => _chromium.launch({ ...o, ...(process.env.HELP_CHROMIUM ? { executablePath: process.env.HELP_CHROMIUM } : {}) }) };
const TYPES = { '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.svg': 'image/svg+xml', '.webp': 'image/webp', '.png': 'image/png' };
const server = http.createServer((req, res) => { let f = path.join(DIST, decodeURIComponent(req.url.split('?')[0])); if (!fs.existsSync(f) || fs.statSync(f).isDirectory()) f = path.join(DIST, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'text/html' }); fs.createReadStream(f).pipe(res); }).listen(4179);
const BASE = 'http://127.0.0.1:4179';
async function ctxFor(browser, sub, opts = {}) {
  const { W = 1440, dark = false } = opts; const now = Math.floor(Date.now() / 1000);
  const session = { access_token: jwt(sub), refresh_token: 'r', token_type: 'bearer', expires_in: 7200, expires_at: now + 7200, user: { id: sub, aud: 'authenticated', role: 'authenticated', email: opts.email || 'x@x.test', user_metadata: { full_name: opts.name || 'Demo' }, app_metadata: {} } };
  const ctx = await browser.newContext({ viewport: { width: W, height: 900 }, colorScheme: dark ? 'dark' : 'light', acceptDownloads: true, isMobile: W < 600, hasTouch: W < 600 });
  await ctx.addInitScript((s) => { localStorage.setItem('sb-127-auth-token', JSON.stringify(s)); localStorage.setItem('i18nextLng', 'en'); }, session);
  const pg = await ctx.newPage(); const errs = [];
  pg.on('pageerror', (e) => errs.push('pageerror: ' + e.message));
  pg.on('console', (m) => { if (m.type() === 'error' && !/WebSocket|Failed to load resource|favicon/.test(m.text())) errs.push('console: ' + m.text()); });
  pg.on('response', (r) => { if (r.url().includes('/rest/v1/') && r.status() >= 400) errs.push(`HTTP ${r.status()} ${r.url().split('/rest/v1/')[1].slice(0, 80)}`); });
  return { ctx, pg, errs };
}
const shot = async (pg, name) => { await pg.waitForTimeout(400); await pg.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }); };
const loadErrors = (pg) => pg.locator('text=Couldn’t load this data').count();
const sql = (q) => execSync(`${process.env.HELP_PSQL || 'psql -h /var/tmp/fpg -p 5433 -U postgres -d fpseed'} -Atc "${q}"`).toString().trim();
