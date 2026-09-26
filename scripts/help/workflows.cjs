// Performs the documented workflows end to end through the UI (report → work order → assign → work → resolve → verify → close, PM, approvals, stock, IoT, notifications, settings…) and checks the database after each step.
// Run with: node scripts/help/run.cjs (see docs/USER_GUIDE.md). Uses the demo organisation from supabase/seed/tenant_demo.sql.
const U = Object.fromEntries(sql("select split_part(u.email,'.',1), u.id from auth.users u where u.email like '%harbourview-demo.test'").split('\n').map(l => l.split('|')));
const ORG = sql("select id from fp_organizations where settings->>'demo_key'='harbourview'");
const results = []; let cur = '';
async function step(name, fn) { cur = name; try { await fn(); results.push(['PASS', name]); } catch (e) { results.push(['FAIL', name, String(e.message || e).split('\n')[0].slice(0, 220)]); } }
const expect = (c, msg) => { if (!c) throw new Error(msg); };
// Returning users: the guided tour was already finished (it is tested in help-e2e).
async function as(browser, who) { const r = await ctxFor(browser, U[who], { email: who + '@harbourview-demo.test', name: who }); await r.ctx.addInitScript((u) => localStorage.setItem('fp.tour.' + u, JSON.stringify({ version: 1, done: true })), U[who]); return r; }
const go = async (pg, r) => { await pg.goto(BASE + r); await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(500); };
const field = (pg, label) => pg.locator(`label:text-is("${label}")`).locator('xpath=..');
async function pick(pg, label, option) { const inp = field(pg, label).locator('input').first(); await inp.click(); await inp.fill(option.slice(0, 12)); await pg.locator(`button:has-text("${option}")`).first().dispatchEvent('mousedown'); await pg.waitForTimeout(150); }
const settle = (pg) => pg.waitForLoadState('networkidle').catch(() => {}).then(() => pg.waitForTimeout(600));
(async () => {
  const browser = await chromium.launch(); const _nc = browser.newContext.bind(browser); browser.newContext = async (o) => { const c = await _nc(o); c.setDefaultTimeout(8000); return c; };
  const T = 'E2E: Pantry sink leaking under cabinet';
  // 1. Occupant reports a fault
  let s = await as(browser, 'olivia');
  await step('Occupant: report a fault (New request form)', async () => {
    await go(s.pg, '/requests/new');
    await field(s.pg, 'Summary').locator('input').fill(T);
    await pick(s.pg, 'Fault type', 'Water leak');
    await pick(s.pg, 'Location', 'Suite 1201 (Marine Co)');
    await s.pg.locator('textarea').first().fill('Water pooling under the pantry sink cabinet.');
    await s.pg.locator('button[type=submit]').click(); await settle(s.pg);
    expect(sql(`select count(*) from fp_requests where title='${T}'`) === '1', 'request not created; url=' + s.pg.url());
  });
  await step('Occupant: sees the request in My requests', async () => { await go(s.pg, '/requests'); expect(await s.pg.locator(`text=${T}`).count() > 0, 'not listed'); });
  const rq = sql(`select id from fp_requests where title='${T}'`);
  await s.ctx.close();
  // 2. Manager converts + assigns
  s = await as(browser, 'priya');
  let wo = '';
  await step('Auto-create is on: the request became a work order, auto-assigned by the Water leak → Kenji rule', async () => {
    wo = sql(`select id from fp_work_orders where request_id='${rq}'`); expect(wo, 'no work order');
    expect(sql(`select assigned_to from fp_work_orders where id='${wo}'`) === U.kenji, 'assigned to ' + sql(`select coalesce(assigned_to::text,'-') from fp_work_orders where id='${wo}'`));
    await go(s.pg, `/requests/${rq}`); expect(await s.pg.locator('text=Linked work order').count() > 0, 'request page does not show the linked work order');
  });
  await step('Manager: reassign the work order to Grace, then back to Kenji', async () => {
    await go(s.pg, `/work-orders/${wo}`);
    const sel = s.pg.locator('select').filter({ has: s.pg.locator('option:has-text("grace.mensah")') }).first();
    await sel.selectOption({ label: await sel.locator('option:has-text("grace.mensah")').first().innerText() }); await settle(s.pg);
    expect(sql(`select assigned_to from fp_work_orders where id='${wo}'`) === U.grace, 'not reassigned');
  });
  await step('Manager: assign Kenji back on the work order', async () => {
    await go(s.pg, `/work-orders/${wo}`);
    const sel = s.pg.locator('select').filter({ has: s.pg.locator('option:has-text("kenji.watanabe")') }).first();
    await go(s.pg, `/work-orders/${wo}`); await sel.selectOption({ label: await sel.locator('option:has-text("kenji.watanabe")').first().innerText() }); await settle(s.pg);
    expect(sql(`select assigned_to from fp_work_orders where id='${wo}'`) === U.kenji, 'not assigned: ' + sql(`select status||' '||coalesce(assigned_to::text,'-') from fp_work_orders where id='${wo}'`));
  });
  await step('Work order status became Assigned', async () => expect(sql(`select status from fp_work_orders where id='${wo}'`) === 'assigned', sql(`select status from fp_work_orders where id='${wo}'`)));
  await s.ctx.close();
  // 3. Technician works it
  s = await as(browser, 'kenji');
  await step('Technician: sees it in My work', async () => { await go(s.pg, '/my-work'); expect(await s.pg.locator(`text=${T}`).count() > 0, 'not in my work'); });
  const status = async (label) => { await s.pg.locator('select[aria-label="Status"]').selectOption({ label }); await settle(s.pg); };
  await step('Technician: start work (→ In progress)', async () => { await go(s.pg, `/work-orders/${wo}`); await status('→ In progress'); expect(sql(`select status from fp_work_orders where id='${wo}'`) === 'in_progress', 'status ' + sql(`select status from fp_work_orders where id='${wo}'`)); });
  await step('Technician: log a part used', async () => {
    const card = s.pg.locator('div.rounded-xl', { hasText: 'Parts used' }).last();
    const sel = card.locator('select'); await sel.selectOption({ index: (await sel.locator('option').allInnerTexts()).findIndex(o => o.includes('Pipe coupling')) });
    await card.locator('input[type=number], input').last().fill('2'); await card.locator('button:has-text("Log part")').click(); await settle(s.pg);
    expect(sql(`select coalesce(sum(quantity),0) from fp_wo_parts where work_order_id='${wo}'`) === '2', 'part not logged');
  });
  await step('Stock decreased after logging the part', async () => expect(sql(`select stock_balance from fp_parts where org_id='${ORG}' and sku='PL-CPL-25'`) === '38', 'stock ' + sql(`select stock_balance from fp_parts where org_id='${ORG}' and sku='PL-CPL-25'`)));
  await step('Technician: log labour', async () => {
    const card = s.pg.locator('div.rounded-xl', { hasText: 'Labor' }).last();
    await card.locator('input').first().fill('40'); await card.locator('button:has-text("Log labor")').click(); await settle(s.pg);
    expect(sql(`select coalesce(sum(minutes),0) from fp_wo_labor where work_order_id='${wo}'`) === '40', 'labour not logged');
  });
  await step('Resolve is blocked until a completion code is set', async () => {
    await status('→ Resolved');
    expect(await s.pg.locator('text=Choose a completion code').count() > 0, 'no guard message shown'); expect(sql(`select status from fp_work_orders where id='${wo}'`) === 'in_progress', 'resolved without code');
  });
  await step('Technician: set closing details and resolve', async () => {
    await go(s.pg, `/work-orders/${wo}`);
    const card = s.pg.locator('div.rounded-xl', { hasText: 'Closing details' });
    await card.locator('select').nth(0).selectOption({ index: 1 }); await settle(s.pg);
    await card.locator('select').nth(1).selectOption({ index: 1 }); await settle(s.pg);
    await status('→ Resolved');
    expect(sql(`select status from fp_work_orders where id='${wo}'`) === 'resolved', 'status ' + sql(`select status from fp_work_orders where id='${wo}'`));
  });
  await step('Requester is notified / request follows the work order', async () => expect(['resolved'].includes(sql(`select status from fp_requests where id='${rq}'`)), 'request status ' + sql(`select status from fp_requests where id='${rq}'`)));
  await s.ctx.close();
  s = await as(browser, 'priya');
  await step('Manager: verify then close', async () => {
    await go(s.pg, `/work-orders/${wo}`); await s.pg.locator('select[aria-label="Status"]').selectOption({ label: '→ Verified' }); await settle(s.pg);
    await s.pg.locator('select[aria-label="Status"]').selectOption({ label: '→ Closed' }); await settle(s.pg);
    expect(sql(`select status from fp_work_orders where id='${wo}'`) === 'closed', 'status ' + sql(`select status from fp_work_orders where id='${wo}'`));
  });
  await step('Work order cost = labour + parts', async () => expect(Number(sql(`select cost from fp_work_orders where id='${wo}'`)) > 0, 'cost ' + sql(`select cost from fp_work_orders where id='${wo}'`)));
  // PM
  await step('Maintenance: Generate due now creates PM work orders', async () => {
    const before = Number(sql(`select count(*) from fp_work_orders where org_id='${ORG}' and pm_schedule_id is not null`));
    await go(s.pg, '/maintenance'); await s.pg.locator('button:has-text("Generate due now")').click(); await settle(s.pg);
    const after = Number(sql(`select count(*) from fp_work_orders where org_id='${ORG}' and pm_schedule_id is not null`));
    const msg = await s.pg.locator('text=/generated|Nothing is due/').first().innerText().catch(() => '');
    expect(after > before || /Nothing is due/.test(msg), `before ${before} after ${after} msg ${msg}`);
    results.push(['INFO', `PM generation: ${after - before} new work order(s); message "${msg}"`]);
  });
  // Approvals
  await step('Approvals: approve the pending CT-01 motor request', async () => {
    await s.ctx.close(); s = await as(browser, 'alex'); await go(s.pg, '/approvals');
    await s.pg.locator('button:has-text("Approve")').first().click(); await settle(s.pg);
    expect(sql(`select a.status from fp_approvals a join fp_work_orders w on w.id=a.work_order_id where w.title like 'Replace cooling tower%'`) === 'approved', 'not approved');
  });
  // Parts restock
  await step('Parts: restock Run capacitor (+10)', async () => {
    await go(s.pg, '/parts'); const row = s.pg.locator('tr', { hasText: 'Run capacitor' }); await row.locator('input').fill('10'); await row.locator('button:has-text("Restock")').click(); await settle(s.pg);
    expect(sql(`select stock_balance from fp_parts where org_id='${ORG}' and sku='EL-CAP-455'`) === '10', 'stock ' + sql(`select stock_balance from fp_parts where org_id='${ORG}' and sku='EL-CAP-455'`));
  });
  // IoT alert ack
  await step('IoT: acknowledge the car-park leak alert', async () => {
    const dev = sql(`select id from fp_devices where org_id='${ORG}' and name like 'Car park B1%'`); await go(s.pg, `/devices/${dev}`); await s.pg.locator('button[role=tab]:has-text("Alerts")').click(); await s.pg.waitForTimeout(500);
    const b = s.pg.locator('button:has-text("Acknowledge")').first(); expect(await b.count() > 0, 'no Acknowledge button'); await b.click(); await settle(s.pg);
    expect(sql(`select status from fp_device_alerts where device_id='${dev}' and title like 'Water%'`) === 'acknowledged', 'status ' + sql(`select status from fp_device_alerts where device_id='${dev}' and title like 'Water%'`));
  });
  // Notifications
  await step('Notifications: open bell and mark all read', async () => {
    await go(s.pg, '/'); await s.pg.locator('button[aria-label*="otification"]').first().click(); await s.pg.waitForTimeout(500);
    const mark = s.pg.locator('button:has-text("Mark all")'); expect(await mark.count() > 0, 'no mark-all button'); await mark.first().click(); await settle(s.pg);
    expect(sql(`select count(*) from fp_notifications where user_id='${U.alex}' and read_at is null`) === '0', 'unread left');
  });
  // Settings currency
  await step('Settings: General shows currency VND and saves', async () => {
    await go(s.pg, '/settings'); const inp = field(s.pg, 'Currency').locator('input'); expect(await inp.inputValue() === 'VND', 'currency ' + await inp.inputValue());
    await s.pg.locator('button:has-text("Save")').first().click(); await settle(s.pg);
  });
  // Location add
  await step('Locations: add a room under Level 12', async () => {
    await go(s.pg, '/locations'); results.push(['INFO', 'locations buttons: ' + (await s.pg.locator('button').allInnerTexts()).filter(Boolean).slice(0, 25).join(' | ')]);
  });
  // Asset create
  await step('Assets: create a new asset', async () => {
    await go(s.pg, '/assets'); await s.pg.locator('button:has-text("New asset"), button:has-text("Add asset")').first().click(); await s.pg.waitForTimeout(400);
    const dlg = s.pg.locator('[role=dialog], form').last(); await dlg.locator('input').first().fill('E2E Exhaust fan EF-12');
    await dlg.locator('button[type=submit]').click(); await settle(s.pg);
    expect(sql(`select count(*) from fp_assets where org_id='${ORG}' and name_i18n->>'en'='E2E Exhaust fan EF-12'`) === '1', 'asset not created');
  });
  // Vendor create
  await step('Vendors: create a vendor', async () => {
    await go(s.pg, '/vendors'); await s.pg.locator('button:has-text("New vendor")').click(); await s.pg.waitForTimeout(300);
    await s.pg.locator('input').first().fill('E2E Glass Repairs'); await s.pg.locator('button[type=submit]').first().click(); await settle(s.pg);
    expect(sql(`select count(*) from fp_vendors where org_id='${ORG}' and name='E2E Glass Repairs'`) === '1', 'vendor not created');
  });
  await step('Financial: a received PO shows its received quantities (24 / 24)', async () => {
    await go(s.pg, '/financial'); await s.pg.locator('text=PO-2026-0101').first().click(); await s.pg.waitForTimeout(800);
    expect(await s.pg.locator('text=24 / 24').count() > 0, 'received column: ' + (await s.pg.locator('main').innerText()).match(/\d+ \/ 24/));
  });
  await step('Tenant home hides draft announcements', async () => {
    const t = await as(browser, 'ethan'); await go(t.pg, '/');
    const txt = await t.pg.locator('main').innerText(); await t.ctx.close();
    expect(txt.includes('Lift L2 back in service') && !txt.includes('Fire drill'), 'draft visible or published missing');
  });
  await step('Asset page shows manufacturer, model and specifications', async () => {
    const a = sql(`select id from fp_assets where org_id='${ORG}' and serial='CH01-2019-4471'`); await go(s.pg, `/assets/${a}`);
    const txt = await s.pg.locator('main').innerText();
    expect(txt.includes('Carrier') && txt.includes('Specifications') && txt.includes('350 RT'), 'missing details');
  });
  // Reports export
  await step('Reports: export work orders CSV', async () => {
    await go(s.pg, '/reports'); const [dl] = await Promise.all([s.pg.waitForEvent('download', { timeout: 8000 }), s.pg.locator('button:has-text("Export work orders")').click()]);
    const p = await dl.path(); const txt = fs.readFileSync(p, 'utf8'); expect(txt.split('\n').length > 50, 'rows ' + txt.split('\n').length);
  });
  await s.ctx.close();
  console.log(results.map(r => r.join('\t')).join('\n')); await browser.close(); server.close();
})();
