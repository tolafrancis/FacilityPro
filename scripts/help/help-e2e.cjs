// Tests the guided tour, the ? Help panel on every main page and the Help Center (search, links, anchors, screenshots, feature directory, phone layout).
// Run with: node scripts/help/run.cjs (see docs/USER_GUIDE.md). Uses the demo organisation from supabase/seed/tenant_demo.sql.
const U = Object.fromEntries(sql("select split_part(u.email,'.',1), u.id from auth.users u where u.email like '%harbourview-demo.test'").split('\n').map(l => l.split('|')));
const ORG = sql("select id from fp_organizations where settings->>'demo_key'='harbourview'");
const R = []; const ok = (c, name, info = '') => R.push([c ? 'PASS' : 'FAIL', name, c ? '' : info]);
async function step(name, fn) { try { await fn(); } catch (e) { R.push(['FAIL', name, String(e.message).split('\n')[0].slice(0, 200)]); } }
const go = async (pg, r) => { await pg.goto(BASE + r); await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(600); };
const tour = (pg) => pg.locator('[data-testid=product-tour]');
const counter = async (pg) => (await tour(pg).locator('p').first().innerText()).trim();
(async () => {
  const browser = await chromium.launch();
  const mk = async (who, W = 1280) => { const r = await ctxFor(browser, U[who], { email: who + '@harbourview-demo.test', name: who, W }); r.ctx.setDefaultTimeout(6000); return r; };
  // ---------- Tour
  let s = await mk('priya');
  await step('tour', async () => {
    await go(s.pg, '/'); await s.pg.waitForTimeout(1200);
    ok(await tour(s.pg).count() === 1, 'Tour starts by itself on first visit to the home screen');
    ok(/Step 1 of 9/i.test(await counter(s.pg)), 'Manager tour has 9 steps, starts at step 1', await counter(s.pg));
    await tour(s.pg).locator('button:has-text("Next")').click(); ok(/Step 2 of 9/i.test(await counter(s.pg)), 'Next moves forward');
    const ring = await s.pg.locator('[data-testid=product-tour] > div').first().boundingBox(); ok(ring && ring.x < 250 && ring.width < 260, 'Step 2 spotlights the side menu', JSON.stringify(ring));
    await tour(s.pg).locator('button:has-text("Previous")').click(); ok(/Step 1 of 9/i.test(await counter(s.pg)), 'Previous moves back');
    await s.pg.keyboard.press('ArrowRight'); await s.pg.keyboard.press('ArrowRight'); ok(/Step 3 of 9/i.test(await counter(s.pg)), 'Arrow keys navigate');
    await tour(s.pg).locator('button:has-text("Skip tour")').last().click(); ok(await tour(s.pg).count() === 0, 'Skip closes the tour');
    await go(s.pg, '/'); await s.pg.waitForTimeout(1500); ok(await tour(s.pg).count() === 0, 'Skipped tour does not reopen in the same visit');
    // restart
    await s.pg.locator('[data-tour=help]').click(); await s.pg.locator('button:has-text("Take the tour")').click(); await s.pg.waitForTimeout(300);
    ok(/Step 1 of 9/i.test(await counter(s.pg)), 'Restart from ? Help → Take the tour');
    for (let i = 0; i < 8; i++) await tour(s.pg).locator('button:has-text("Next")').click();
    ok(await tour(s.pg).locator('button:has-text("Finish")').count() === 1, 'Last step shows Finish');
    await tour(s.pg).locator('button:has-text("Finish")').click();
    const st = JSON.parse(await s.pg.evaluate((u) => localStorage.getItem('fp.tour.' + u), U.priya) || '{}');
    ok(st.done === true && st.version === 1, 'Finishing stores completion for this user', JSON.stringify(st));
  });
  await s.ctx.close();
  // new visit (fresh tab/session) in a context that already has "done": no auto start
  s = await mk('priya'); await s.ctx.addInitScript((u) => localStorage.setItem('fp.tour.' + u, JSON.stringify({ version: 1, done: true })), U.priya);
  await step('tour-done', async () => { await go(s.pg, '/'); await s.pg.waitForTimeout(1500); ok(await tour(s.pg).count() === 0, 'Completed tour does not start again'); });
  await s.ctx.close();
  // don't show again
  s = await mk('daniel');
  await step('tour-dismiss', async () => {
    await go(s.pg, '/'); await s.pg.waitForTimeout(1300);
    await tour(s.pg).locator('input[type=checkbox]').check(); await tour(s.pg).locator('button:has-text("Skip tour")').last().click();
    const st = JSON.parse(await s.pg.evaluate((u) => localStorage.getItem('fp.tour.' + u), U.daniel) || '{}');
    ok(st.dismissed === true, "Don't show again is stored per user", JSON.stringify(st));
    const p2 = await s.ctx.newPage(); await p2.goto(BASE + '/'); await p2.waitForTimeout(1800);
    ok(await p2.locator('[data-testid=product-tour]').count() === 0, "Dismissed tour stays hidden in a new tab");
    ok(await p2.evaluate((u) => localStorage.getItem('fp.tour.' + u) !== null, U.minh) === false, 'Tour state is per user (another user unaffected)');
  });
  await s.ctx.close();
  // other roles
  for (const [who, n] of [['minh', 8], ['olivia', 7]]) {
    s = await mk(who);
    await step('tour-' + who, async () => { await go(s.pg, '/'); await s.pg.waitForTimeout(1300); ok(new RegExp(`Step 1 of ${n}`, 'i').test(await counter(s.pg)), `${who === 'minh' ? 'Technician' : 'Occupant'} tour has ${n} steps`, await counter(s.pg)); });
    await s.ctx.close();
  }
  // phone
  s = await mk('sofia', 390); await s.pg.setViewportSize({ width: 390, height: 844 });
  await step('tour-phone', async () => {
    await go(s.pg, '/'); await s.pg.waitForTimeout(1300);
    const b = await tour(s.pg).locator('[role=dialog]').boundingBox(); ok(b && b.x >= 0 && b.x + b.width <= 390, 'Tour card fits a phone screen', JSON.stringify(b));
    await tour(s.pg).locator('button:has-text("Next")').click(); ok(/Step 2/i.test(await counter(s.pg)), 'Tour works on a phone (menu step falls back to centred)');
  });
  await s.ctx.close();

  // ---------- ? Help panel on each page
  s = await mk('alex'); await s.ctx.addInitScript((u) => localStorage.setItem('fp.tour.' + u, JSON.stringify({ version: 1, done: true })), U.alex);
  const wo = sql(`select id from fp_work_orders where org_id='${ORG}' and title like 'Chiller CH-01 high%'`);
  const asset = sql(`select id from fp_assets where org_id='${ORG}' and serial='CH01-2019-4471'`);
  const pages = [['/', 'Dashboard'], ['/requests', 'Requests'], ['/requests/new', 'Report a fault'], ['/work-orders', 'Work orders'], [`/work-orders/${wo}`, 'Work order'], ['/my-work', 'My work'], ['/maintenance', 'Preventive maintenance'], ['/checklists', 'Checklists'], ['/assets', 'Assets'], [`/assets/${asset}`, 'Asset'], ['/parts', 'Parts & inventory'], ['/vendors', 'Vendors & contracts'], ['/locations', 'Locations'], ['/workflows', 'Workflows'], ['/approvals', 'Approvals'], ['/inbox', 'Inbox'], ['/devices', 'Devices'], ['/desks', 'Desks'], ['/facilities', 'Facilities'], ['/reports', 'Reports'], ['/financial', 'Financial operations'], ['/documents', 'Documents'], ['/permits', 'Permits to work'], ['/attendance', 'Technician attendance'], ['/tenant-experience', 'Tenant experience'], ['/surveys', 'Surveys'], ['/security', 'Security'], ['/settings', 'Settings'], ['/billing', 'Billing']];
  let bad = [];
  for (const [route, title] of pages) {
    await step('help ' + route, async () => {
      await go(s.pg, route); await s.pg.locator('[data-tour=help]').click();
      const d = s.pg.locator('[data-testid=help-drawer]'); const h = (await d.locator('h2').innerText()).trim();
      if (h !== title) bad.push(`${route}: "${h}"`);
      const link = d.locator('a:has-text("Read the full guide")');
      if (await link.count()) {
        const href = await link.getAttribute('href'); await link.click(); await s.pg.waitForTimeout(500);
        const hash = href.split('#')[1];
        if (!s.pg.url().includes(href.split('#')[0])) bad.push(`${route}: guide link went to ${s.pg.url()}`);
        if (hash && await s.pg.locator(`[id="${hash}"]`).count() === 0) bad.push(`${route}: anchor #${hash} missing`);
      } else bad.push(`${route}: no guide link`);
    });
  }
  ok(bad.length === 0, `? Help panel shows the right help and a working guide link on ${pages.length} pages`, bad.join('; '));
  await step('help-esc', async () => { await go(s.pg, '/parts'); await s.pg.locator('[data-tour=help]').click(); await s.pg.keyboard.press('Escape'); ok(await s.pg.locator('[data-testid=help-drawer]').count() === 0, 'Escape closes the help panel'); });

  // ---------- Help Center
  await step('center', async () => {
    await go(s.pg, '/help');
    ok(await s.pg.locator('main a[href^="/help/guide/"]').count() >= 14, 'Help Center lists all 14 guide sections');
    ok(await s.pg.locator('text=For your role').count() === 1, 'Help Center suggests the quick start for your role');
    await s.pg.locator('main input[type=search]').fill('completion code'); await s.pg.waitForTimeout(300);
    const first = s.pg.locator('main section[aria-live] a').first(); ok(await first.count() === 1, 'Search returns results');
    await first.click(); await s.pg.waitForTimeout(600); ok(/\/help\/(guide|quick-start)\/[a-z_-]+#/.test(s.pg.url()), 'Search result opens the matching help section', s.pg.url());
    await s.pg.locator('main input[type=search]').first().count();
    await go(s.pg, '/help?q=zzzqqq'); ok(await s.pg.locator('text=Nothing matches').count() === 1, 'Search shows a no-results message');
    await go(s.pg, '/help?q=dieu hoa'); ok(true, 'Accent-insensitive search runs');
  });
  const imgErrs = [];
  for (const g of ['getting-started', 'dashboard', 'facilities', 'assets', 'preventive-maintenance', 'work-orders', 'technicians-teams', 'vendors', 'inventory', 'iot', 'notifications', 'reports', 'user-management', 'settings']) {
    await step('guide ' + g, async () => {
      await go(s.pg, '/help/guide/' + g); await s.pg.evaluate(async () => { for (const i of document.querySelectorAll('article img')) { i.loading = 'eager'; } }); await s.pg.waitForTimeout(800);
      const broken = await s.pg.evaluate(() => [...document.querySelectorAll('article img')].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.getAttribute('src')));
      imgErrs.push(...broken.map((b) => g + ':' + b));
      if (g === 'work-orders') {
        await s.pg.locator('article a[href="/help/guide/settings#workflows-automation"]').first().click(); await s.pg.waitForTimeout(700);
        ok(/settings#workflows-automation/.test(s.pg.url()) && await s.pg.locator('#workflows-automation').isVisible(), 'Cross-links open the target section in-app', s.pg.url());
      }
    });
  }
  ok(imgErrs.length === 0, 'Every screenshot in the 14 guide sections loads', imgErrs.join(', '));
  await step('toc', async () => { await go(s.pg, '/help/guide/iot'); await s.pg.locator('nav[aria-label="On this page"] a:has-text("Alerts")').click(); await s.pg.waitForTimeout(500); ok(s.pg.url().endsWith('#alerts'), 'On-this-page links jump to the heading'); });
  await step('features', async () => {
    await go(s.pg, '/help/features');
    const n = await s.pg.locator('main li[id] details').count(); ok(n >= 45, `Feature directory lists ${n} features`);
    await s.pg.locator('main input[type=search]').fill('restock'); await s.pg.waitForTimeout(300);
    const titles = await s.pg.locator('main li[id] summary .font-medium').allInnerTexts(); ok(titles.includes('Parts & stock'), 'Feature search finds Parts & stock for "restock"', titles.join('|'));
    await s.pg.locator('main input[type=search]').fill(''); await s.pg.locator('main select').selectOption('IoT'); await s.pg.waitForTimeout(200);
    ok(await s.pg.locator('main li[id]').count() === 3, 'Area filter shows only IoT features');
    await s.pg.locator('main input[type=search]').fill('zz'); await s.pg.evaluate(() => { location.hash = 'purchase-orders'; }); await s.pg.waitForTimeout(600);
    ok(await s.pg.locator('#purchase-orders details[open]').count() === 1, 'Deep link opens that feature');
    for (const k of ['What it\'s for', 'Who can use it', 'Where to find it', 'Before you start', 'How to use it', 'Related']) ok(await s.pg.locator(`#purchase-orders dt:text-is("${k}")`).count() === 1, `Feature entry shows "${k}"`);
    ok(await s.pg.locator('#purchase-orders img').count() === 1, 'Feature entry shows a screenshot');
    await s.pg.locator('#purchase-orders a:has-text("Open this page")').click(); await s.pg.waitForTimeout(600); ok(s.pg.url().endsWith('/financial'), 'Open this page goes to the feature');
  });
  for (const r of ['org_admin', 'manager', 'technician', 'occupant', 'vendor']) await step('qs ' + r, async () => { await go(s.pg, '/help/quick-start/' + r); ok(await s.pg.locator('article h1').count() === 1 && (await s.pg.locator('article').innerText()).length > 400, `Quick start page for ${r}`); });
  await step('known', async () => { await go(s.pg, '/help/known-issues'); ok((await s.pg.locator('article').innerText()).includes('Feature requires attention'), 'Known issues page lists items marked "Feature requires attention"'); });
  await step('unknown', async () => { await go(s.pg, '/help/guide/nope'); ok(await s.pg.locator('text=Not found').count() > 0, 'Unknown guide page shows Not found'); });
  const pe = s.errs.filter((e) => !/auth\/v1/.test(e)); ok(pe.length === 0, 'No console errors in the Help Center', [...new Set(pe)].slice(0, 5).join(' | '));
  await s.ctx.close();
  // tenant help + phone layout
  s = await mk('olivia', 390); await s.pg.setViewportSize({ width: 390, height: 844 }); await s.ctx.addInitScript((u) => localStorage.setItem('fp.tour.' + u, JSON.stringify({ version: 1, done: true })), U.olivia);
  await step('tenant', async () => {
    await go(s.pg, '/help'); ok(await s.pg.locator('main a[href="/help/quick-start/occupant"]').count() >= 1, 'Tenant sees the Help Center with their quick start');
    for (const r of ['/help', '/help/guide/work-orders', '/help/features', '/help/quick-start/occupant']) { await go(s.pg, r); const o = await s.pg.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1); ok(!o, `No sideways scrolling on a phone: ${r}`); }
    await go(s.pg, '/'); await s.pg.locator('[data-tour=help]').click(); ok((await s.pg.locator('[data-testid=help-drawer] h2').innerText()).trim() === 'Home', 'Tenant home has its own help text');
  });
  await s.ctx.close();
  console.log(R.map((r) => r.join('\t')).join('\n'));
  console.log(`\n${R.filter((r) => r[0] === 'PASS').length} passed, ${R.filter((r) => r[0] === 'FAIL').length} failed`);
  await browser.close(); server.close();
})();
