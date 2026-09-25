// deno test supabase/functions/_shared/turnstile.test.ts
import { verifyTurnstile } from './turnstile.ts';

function eq(a: unknown, b: unknown) {
  if (a !== b) throw new Error(`expected ${String(b)}, got ${String(a)}`);
}
const reply = (body: unknown, status = 200) => (async () => new Response(JSON.stringify(body), { status })) as unknown as typeof fetch;
const base = { secret: 's', action: 'public_report', hostnames: ['app.example.com'] };

Deno.test('a valid token for this form and host passes', async () => {
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: reply({ success: true, action: 'public_report', hostname: 'app.example.com' }) }), 'ok');
});
Deno.test('a token issued for sign-in cannot submit a report', async () => {
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: reply({ success: true, action: 'login', hostname: 'app.example.com' }) }), 'failed');
});
Deno.test('a token issued on another site is refused', async () => {
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: reply({ success: true, action: 'public_report', hostname: 'evil.example' }) }), 'failed');
});
Deno.test('expired, reused or bad tokens fail', async () => {
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: reply({ success: false, 'error-codes': ['timeout-or-duplicate'] }) }), 'failed');
  eq(await verifyTurnstile('', { ...base, fetchImpl: reply({ success: true }) }), 'failed');
  eq(await verifyTurnstile('x'.repeat(2049), { ...base, fetchImpl: reply({ success: true }) }), 'failed');
});
Deno.test('a wrong secret or a Cloudflare outage is "unavailable", not the visitor failing', async () => {
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: reply({ success: false, 'error-codes': ['invalid-input-secret'] }) }), 'unavailable');
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: reply({}, 502) }), 'unavailable');
  eq(await verifyTurnstile('tok', { ...base, fetchImpl: (async () => { throw new TypeError('network'); }) as unknown as typeof fetch }), 'unavailable');
});
Deno.test('Cloudflare testing keys (empty action) pass when no hostname list is set', async () => {
  eq(await verifyTurnstile('XXXX.DUMMY.TOKEN.XXXX', { secret: 's', action: 'public_report', fetchImpl: reply({ success: true, action: '', hostname: 'example.com' }) }), 'ok');
});
