// Captures the Help Center screenshots (public/help/screens/*.webp + manifest.json) from the running app, drawing numbered markers on real elements.
// Run with: node scripts/help/run.cjs (see docs/USER_GUIDE.md). Uses the demo organisation from supabase/seed/tenant_demo.sql.
// HELP_LANG=vi captures the Vietnamese set into public/help/screens/vi/. Pages are driven in
// English (the selectors below match English labels) and switched to Vietnamese just before each shot.
const LANG = process.env.HELP_LANG === 'vi' ? 'vi' : 'en';
const OUTDIR = path.join(ROOT, 'public/help/screens', LANG === 'en' ? '' : LANG); fs.mkdirSync(OUTDIR, { recursive: true });
async function setLang(pg, lng) {
  if (LANG === 'en') return;
  const changed = await pg.evaluate((lng) => {
    const b = [...document.querySelectorAll('button[aria-pressed]')].find((x) => x.textContent.trim() === lng.toUpperCase());
    if (!b || b.getAttribute('aria-pressed') === 'true') return false; b.click(); return true;
  }, lng);
  if (changed) await pg.waitForTimeout(900);
}
const U = Object.fromEntries(sql("select split_part(u.email,'.',1), u.id from auth.users u where u.email like '%harbourview-demo.test'").split('\n').map(l => l.split('|')));
const ORG = sql("select id from fp_organizations where settings->>'demo_key'='harbourview'");
const id = (q) => sql(q);
const IDS = {
  woLive: id(`select id from fp_work_orders where org_id='${ORG}' and title like 'Chiller CH-01 high%'`),
  woDone: id(`select id from fp_work_orders where org_id='${ORG}' and title='Chiller CH-01 monthly inspection' and status='closed' order by created_at desc limit 1`),
  asset: id(`select id from fp_assets where org_id='${ORG}' and serial='CH01-2019-4471'`),
  reqNew: id(`select id from fp_requests where org_id='${ORG}' and title = 'Office 501 too cold near windows'`),
  cl: id(`select id from fp_checklist_templates where org_id='${ORG}' and name_i18n->>'en' like 'Chiller%'`),
  dev: id(`select id from fp_devices where org_id='${ORG}' and name like 'CH-01%'`),
};
const manifest = {};
const W = 1280, H = 800;
async function mk(browser, who, { tour = false, W: w = W, h = H } = {}) {
  const r = await ctxFor(browser, U[who], { email: `${who}@harbourview-demo.test`, name: who, W: w });
  await r.pg.setViewportSize({ width: w, height: h }); r.ctx.setDefaultTimeout(4000);
  if (!tour) await r.ctx.addInitScript((u) => localStorage.setItem('fp.tour.' + u, JSON.stringify({ version: 1, done: true })), U[who]);
  return r;
}
const go = async (pg, route) => { await pg.goto(BASE + route); await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(700); };
// Numbered markers on real elements. items: [n, locator, side?]
async function mark(pg, items) {
  const boxes = [];
  // Resolve every marker while the page is still in English, then switch language and measure.
  const handles = [];
  for (const [n, loc, side = 'tl'] of items) {
    const el = typeof loc === 'string' ? pg.locator(loc).first() : loc.first();
    handles.push([n, loc, side, await el.elementHandle({ timeout: 4000 }).catch(() => null)]);
  }
  await setLang(pg, LANG);
  for (const [n, loc, side, h] of handles) {
    const b = h ? await h.boundingBox().catch(() => null) : null;
    if (!b) { console.log('  !! marker', n, 'not found:', String(loc)); continue; }
    const sx = await pg.evaluate(() => [window.scrollX, window.scrollY]);
    boxes.push({ n, x: b.x + sx[0], y: b.y + sx[1], w: b.width, h: b.height, side });
  }
  await pg.evaluate((boxes) => {
    document.querySelectorAll('.fp-mk').forEach((e) => e.remove());
    const glyph = '①②③④⑤⑥⑦⑧⑨⑩⑪⑫';
    for (const b of boxes) {
      const o = document.createElement('div'); o.className = 'fp-mk';
      Object.assign(o.style, { position: 'absolute', left: b.x - 3 + 'px', top: b.y - 3 + 'px', width: b.w + 6 + 'px', height: b.h + 6 + 'px', border: '2px solid #E8542B', borderRadius: '10px', zIndex: 99998, pointerEvents: 'none', boxShadow: '0 0 0 3px rgba(232,84,43,.18)' });
      const c = document.createElement('div'); c.className = 'fp-mk'; c.textContent = String(b.n); c.setAttribute('aria-label', glyph[b.n - 1]);
      const left = b.side.includes('r') ? b.x + b.w - 8 : b.x - 14; const top = b.side.includes('b') ? b.y + b.h - 8 : b.y - 14;
      Object.assign(c.style, { position: 'absolute', left: Math.max(2, left) + 'px', top: Math.max(2, top) + 'px', width: '26px', height: '26px', borderRadius: '50%', background: '#E8542B', color: '#fff', font: '700 14px/26px system-ui,sans-serif', textAlign: 'center', border: '2px solid #fff', boxShadow: '0 2px 6px rgba(0,0,0,.35)', zIndex: 99999, pointerEvents: 'none' });
      document.body.appendChild(o); document.body.appendChild(c);
    }
  }, boxes);
}
async function save(pg, name, title, legend, { full = false, clip = null, maxH = 1500 } = {}) {
  await setLang(pg, LANG);
  await pg.waitForTimeout(250);
  let opt = {};
  if (clip) opt.clip = clip;
  else if (full) { const h = await pg.evaluate(() => document.documentElement.scrollHeight); opt = { fullPage: true, clip: { x: 0, y: 0, width: pg.viewportSize().width, height: Math.min(h, maxH) } }; }
  const png = await pg.screenshot({ ...opt, type: 'png' });
  const conv = await pg.context().newPage();
  const webp = await conv.evaluate(async (b64) => {
    const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
    const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; c.getContext('2d').drawImage(img, 0, 0);
    return c.toDataURL('image/webp', 0.82).split(',')[1];
  }, png.toString('base64'));
  await conv.close();
  fs.writeFileSync(path.join(OUTDIR, name + '.webp'), Buffer.from(webp, 'base64'));
  manifest[name] = { title, legend };
  console.log('saved', name, Math.round(Buffer.from(webp, 'base64').length / 1024) + 'KB');
  await pg.evaluate(() => document.querySelectorAll('.fp-mk').forEach((e) => e.remove()));
  await setLang(pg, 'en');
}
const label = (pg, text) => pg.locator(`label:text-is("${text}")`).locator('xpath=..');
const btn = (pg, text) => pg.locator(`button:has-text("${text}")`);
const card = (pg, text) => pg.locator('div.rounded-xl', { hasText: text }).last();
const boxOf = (pg, text) => pg.locator(`p:text-is("${text}"), dt:text-is("${text}"), label:text-is("${text}"), h2:text-is("${text}"), span:text-is("${text}")`).first().locator('xpath=ancestor::*[contains(@class,"rounded")][1]');

(async () => {
  const browser = await chromium.launch();
  // ---- Signed out: sign in
  { const ctx = await browser.newContext({ viewport: { width: W, height: H } }); ctx.setDefaultTimeout(4000); const pg = await ctx.newPage();
    await pg.addInitScript(() => localStorage.setItem('i18nextLng', 'en'));
    await go(pg, '/signin');
    await mark(pg, [[1, 'input[type=email]'], [2, 'input[type=password]'], [3, 'label:has(input[type=checkbox])'], [4, 'a[href*="forgot"]'], [5, 'button[type=submit]'], [6, 'a[href*="signup"]']]);
    await save(pg, 'signin', 'Sign in', ['Email address', 'Password', 'Keep me logged in', 'Forgot password?', 'Sign in', 'Create an account']);
    await ctx.close(); }
  // ---- Admin (Alex)
  let s = await mk(browser, 'alex');
  await go(s.pg, '/');
  await mark(s.pg, [[1, '[data-tour=nav]'], [2, '[data-tour=org]'], [3, '[data-tour=create]'], [4, '[data-tour=help]'], [5, '[data-tour=bell]'], [6, '[data-tour=language]'], [7, '[data-tour=stats]']]);
  await save(s.pg, 'dashboard', 'Dashboard (Administrator)', ['Menu — every module, grouped', 'Organisation and your role', 'Create — report a fault or add anything', '? Help for the page you are on', 'Notifications', 'Language (EN / VI)', 'Key numbers']);
  await s.pg.evaluate(() => window.scrollTo(0, 420)); await s.pg.waitForTimeout(300);
  await mark(s.pg, [[1, 'section:has(h2:text-is("Weekly"))'], [2, 'section:has(h2:text-is("Recent Activity"))'], [3, 'section:has(h2:text-is("Category"))'], [4, boxOf(s.pg, 'To Do List')]]);
  await save(s.pg, 'dashboard-charts', 'Dashboard — charts and lists', ['Weekly: faults reported vs resolved', 'Recent activity (latest requests)', 'Faults by category, last 30 days', 'To-do list for setting up'], { clip: { x: 240, y: 0, width: W - 240, height: H } });
  await s.pg.evaluate(() => window.scrollTo(0, 0));
  await btn(s.pg, 'Create').first().click(); await s.pg.waitForTimeout(300);
  await mark(s.pg, [[1, '[role=menu]']]);
  await save(s.pg, 'dashboard-create', 'The Create menu', ['Everything you can create from the dashboard'], { clip: { x: 640, y: 80, width: 640, height: 560 } });
  // notifications
  await go(s.pg, '/'); await s.pg.locator('[data-tour=bell] button').first().click(); await s.pg.waitForTimeout(500);
  await mark(s.pg, [[1, 'button:has-text("Mark all read")'], [2, s.pg.locator('a[href="/approvals"], button:has-text("Approval needed")').first()]]);
  await save(s.pg, 'notifications', 'Notifications panel', ['Mark all read', 'A notification — click to open the related page'], { clip: { x: 560, y: 0, width: 720, height: 640 } });
  // locations
  await go(s.pg, '/locations');
  await mark(s.pg, [[1, 'button:has-text("Add site")'], [2, btn(s.pg, 'Add building').first()], [3, btn(s.pg, 'Add floor').first()], [4, btn(s.pg, 'Add room').first()], [5, btn(s.pg, 'Add zone').first()], [6, s.pg.locator('button[aria-label*="ename"], button[title*="ename"]').first()]]);
  await save(s.pg, 'locations', 'Locations tree', ['Add site', 'Add building to a site', 'Add floor to a building', 'Add room', 'Add zone (area such as a lobby or car park)', 'Rename / delete'], { full: true, maxH: 1100 });
  // assets
  await go(s.pg, '/assets');
  await mark(s.pg, [[1, 'button:has-text("Add asset")'], [2, s.pg.locator('main select').first().locator('xpath=ancestor::div[2]')], [3, s.pg.locator('main table tbody tr, main a[href^="/assets/"]').first()]]);
  await save(s.pg, 'assets', 'Asset register', ['Add asset', 'Search and filters', 'An asset — click to open it'], { full: true, maxH: 1000 });
  await btn(s.pg, 'Add asset').first().click(); await s.pg.waitForTimeout(400);
  const dlg = s.pg.locator('[role=dialog]').last();
  await save(s.pg, 'asset-new', 'Add asset dialog', []);
  await go(s.pg, `/assets/${IDS.asset}`);
  await mark(s.pg, [[1, 'main h1'], [2, 'button:has-text("Report fault")'], [3, 'button:has-text("Edit")'], [4, s.pg.locator('main button:has-text("History")').first()], [5, s.pg.locator('main dl')]]);
  await save(s.pg, 'asset-detail', 'Asset details — Chiller CH-01', ['Asset name and type', 'Report fault on this asset', 'Edit / Delete (managers)', 'Tabs: Details, History, Meters, Documents, QR code', 'Details and specifications'], { full: true, maxH: 1000 });
  await s.pg.locator('main button:has-text("History")').first().click(); await s.pg.waitForTimeout(400);
  await save(s.pg, 'asset-history', 'Asset history tab', [], { full: true, maxH: 900 });
  await s.pg.locator('main button:has-text("Meters")').first().click(); await s.pg.waitForTimeout(600);
  await save(s.pg, 'asset-meters', 'Asset meters tab', [], { full: true, maxH: 900 });
  await s.pg.locator('main button:has-text("QR code")').first().click(); await s.pg.waitForTimeout(400);
  await save(s.pg, 'asset-qr', 'Asset QR code tab', [], { full: true, maxH: 900 });
  // maintenance
  await go(s.pg, '/maintenance');
  await mark(s.pg, [[1, 'button:has-text("New schedule")'], [2, 'button:has-text("Generate due now")'], [3, s.pg.locator('main p, main h2, main span').filter({ hasText: /^[A-Z][a-z]+ 20\d\d$/ }).first().locator('xpath=ancestor::*[contains(@class,"rounded")][1]')], [4, s.pg.locator('main').getByText(/^Overdue/).first().locator('xpath=ancestor::*[contains(@class,"rounded")][1]')], [5, s.pg.locator('button:has-text("Required parts")').first()], [6, s.pg.locator('button:has-text("Pause")').first()]]);
  await save(s.pg, 'maintenance', 'Preventive maintenance', ['New schedule', 'Generate due now', 'Calendar — dots show due dates', 'An overdue schedule', 'Required parts kit', 'Pause / Resume'], { full: true, maxH: 1000 });
  await btn(s.pg, 'New schedule').click(); await s.pg.waitForTimeout(400);
  await save(s.pg, 'maintenance-new', 'New maintenance schedule dialog', []);
  // checklists
  await go(s.pg, `/checklists/${IDS.cl}`);
  await save(s.pg, 'checklist-template', 'Checklist template — items', [], { full: true, maxH: 1000 });
  // requests
  await go(s.pg, '/requests');
  await mark(s.pg, [[1, s.pg.locator('main a[href="/requests/new"], main button:has-text("New request")').first()], [2, s.pg.locator('main input').first()], [3, s.pg.locator('main select').first()], [4, s.pg.locator('main table tbody tr, main li').first()]]);
  await save(s.pg, 'requests', 'Requests list', ['New request', 'Search', 'Filter by status / location', 'A request — click to open'], { full: true, maxH: 900 });
  await go(s.pg, `/requests/${IDS.reqNew}`);
  await mark(s.pg, [[1, 'button:has-text("Create work order")'], [2, s.pg.locator('main select').first()]]);
  await save(s.pg, 'request-detail', 'Request details (manager view)', ['Create work order from this request', 'Change the request status'], { full: true, maxH: 900 });
  // work orders
  await go(s.pg, '/work-orders');
  await mark(s.pg, [[1, 'main input[type=search], main input'], [2, s.pg.locator('main select').first()], [3, s.pg.locator('main a:has-text("TV display"), main button:has-text("TV display")').first()], [4, s.pg.locator('main table tbody tr').first()]]);
  await save(s.pg, 'work-orders', 'Work orders list', ['Search', 'Filters: status, location, assignee, priority', 'TV display link', 'A work order — click to open'], { maxH: 900, full: true });
  await go(s.pg, `/work-orders/${IDS.woLive}`);
  await mark(s.pg, [[1, 'select[aria-label="Status"]'], [2, boxOf(s.pg, 'Assignee').locator('select')], [3, boxOf(s.pg, 'Vendor').locator('select')], [4, s.pg.locator('a:has-text("Print job sheet")')], [5, s.pg.locator('main').getByText('Started', { exact: true }).first().locator('xpath=ancestor::*[contains(@class,"rounded")][1]')]]);
  await save(s.pg, 'wo-detail-top', 'Work order — header and details', ['Status — shows only the moves allowed next', 'Assignee', 'Vendor (or In-house)', 'Print job sheet', 'Timeline: started, resolved, verified, closed']);
  await s.pg.evaluate(() => window.scrollTo(0, 800)); await s.pg.waitForTimeout(300);
  await mark(s.pg, [[1, card(s.pg, 'Closing details')], [2, card(s.pg, 'Approval')], [3, card(s.pg, 'Checklist')], [4, card(s.pg, 'Parts used')], [5, card(s.pg, 'Labor')]]);
  await save(s.pg, 'wo-detail-work', 'Work order — recording the work', ['Closing details: cause and completion code', 'Approval', 'Checklist', 'Parts used', 'Labour']);
  await go(s.pg, `/work-orders/${IDS.woDone}`);
  await s.pg.evaluate(() => window.scrollTo(0, 700)); await s.pg.waitForTimeout(300);
  await save(s.pg, 'wo-closed', 'A closed work order with its checklist results', []);
  await go(s.pg, `/work-orders/${IDS.woLive}/print`);
  await save(s.pg, 'job-sheet', 'Printable job sheet', [], { full: true, maxH: 1200 });
  // approvals
  await go(s.pg, '/approvals');
  await mark(s.pg, [[1, 'button:has-text("Approve")'], [2, 'button:has-text("Reject")']]);
  await save(s.pg, 'approvals', 'Approvals', ['Approve', 'Reject'], { maxH: 700, full: true });
  // vendors
  await go(s.pg, '/vendors');
  await mark(s.pg, [[1, 'button:has-text("New vendor")'], [2, 'button:has-text("New contract")'], [3, 'button:has-text("New license")'], [4, s.pg.locator('text=Expiring soon').first()], [5, s.pg.locator('text=Expired').first()]]);
  await save(s.pg, 'vendors', 'Vendors, contracts and licences', ['New vendor', 'New contract', 'New licence', 'Contract expiring soon', 'Expired licence'], { full: true, maxH: 1200 });
  // parts
  await go(s.pg, '/parts');
  const capRow = s.pg.locator('tr', { hasText: 'Run capacitor' });
  await mark(s.pg, [[1, 'button:has-text("New part")'], [2, s.pg.locator('main select').first()], [3, s.pg.locator('text=Low stock').first()], [4, capRow.locator('input')], [5, capRow.locator('button:has-text("Restock")')], [6, s.pg.locator('main tbody tr button').first()]]);
  await save(s.pg, 'parts', 'Parts & inventory', ['New part', 'Filter by category', 'Low-stock warning', 'Quantity to add', 'Restock', 'Show transaction history'], { full: true, maxH: 1000 });
  await s.pg.locator('main tbody tr button').first().click(); await s.pg.waitForTimeout(500);
  await save(s.pg, 'parts-history', 'Part transaction history', [], { clip: { x: 240, y: 250, width: W - 240, height: 420 } });
  // financial
  await go(s.pg, '/financial');
  await mark(s.pg, [[1, s.pg.locator('main div.rounded-2xl, main div.rounded-xl').filter({ hasText: 'Budgeted' }).first()], [2, s.pg.locator('button:has-text("New PO"), a:has-text("New PO")').first()], [3, s.pg.locator('text=PO-2026-0102').first()], [4, s.pg.locator('main span').filter({ hasText: /^received$/i }).first()]]);
  await save(s.pg, 'financial', 'Financial operations — procurement', ['Budget, committed spend, open POs', 'New PO', 'Purchase order number', 'PO status: RFQ → PO → Approved → Received'], { clip: { x: 240, y: 0, width: W - 240, height: 620 } });
  await s.pg.locator('text=PO-2026-0101').first().click(); await s.pg.waitForTimeout(600);
  await save(s.pg, 'financial-po', 'A purchase order opened', [], { clip: { x: 240, y: 180, width: W - 240, height: 620 } });
  // devices
  await go(s.pg, '/devices');
  await mark(s.pg, [[1, s.pg.locator('button:has-text("Add device")').first()], [2, s.pg.locator('main div.rounded-xl, main div.rounded-2xl').first()], [3, s.pg.locator('main').getByText('CH-01 chiller monitor').first()]]);
  await save(s.pg, 'devices', 'IoT devices', ['Add device', 'Fleet summary', 'A device — click for live data'], { full: true, maxH: 1100 });
  await go(s.pg, `/devices/${IDS.dev}`); await s.pg.waitForTimeout(800);
  await mark(s.pg, [[1, 'main [role=tablist]'], [2, s.pg.locator('main').locator('text=Live data').first()]]);
  await save(s.pg, 'device-detail', 'Device — CH-01 chiller monitor', ['Tabs: Overview, Alerts, Commands, Data points, Maintenance, Rules, Connection', 'Live data and history chart'], { full: true, maxH: 1200 });
  await s.pg.locator('button[role=tab]:has-text("Alerts")').click(); await s.pg.waitForTimeout(500);
  await mark(s.pg, [[1, s.pg.locator('button:has-text("Resolve")').first()]]);
  await save(s.pg, 'device-alerts', 'Device alerts', ['Resolve (Acknowledge appears while an alert is open)'], { full: true, maxH: 900 });
  await s.pg.locator('button[role=tab]:has-text("Rules")').click(); await s.pg.waitForTimeout(500);
  await save(s.pg, 'device-rules', 'Device threshold rules', [], { full: true, maxH: 1100 });
  // reports
  await go(s.pg, '/reports');
  await mark(s.pg, [[1, boxOf(s.pg, 'From')], [2, s.pg.locator('text=Open requests').first().locator('xpath=..')], [3, s.pg.locator('text=Cost & spend').first()], [4, 'button:has-text("Export work orders")'], [5, s.pg.locator('text=Activity log').first()]]);
  await save(s.pg, 'reports', 'Reports', ['Filters: dates, location, technician, priority', 'Operational metrics', 'Cost & spend', 'CSV exports', 'Activity log'], { full: true, maxH: 1500 });
  // settings
  for (const [tab, name, title] of [['General', 'settings-general', 'Settings — General'], ['Catalogs', 'settings-catalogs', 'Settings — Catalogs'], ['SLA', 'settings-sla', 'Settings — SLA targets'], ['Team & roles', 'settings-team', 'Settings — Team & roles'], ['TV displays', 'settings-displays', 'Settings — TV displays'], ['Integrations', 'settings-integrations', 'Settings — Integrations']]) {
    await go(s.pg, '/settings'); await s.pg.locator(`main button:has-text("${tab}")`).first().click(); await s.pg.waitForTimeout(700);
    if (tab === 'Team & roles') {
      await mark(s.pg, [[1, s.pg.locator('h2:text-is("Members")').locator('xpath=..')], [2, s.pg.locator('main select').first()], [3, s.pg.locator('h2:text-is("Join links & QR codes")').locator('xpath=..')], [4, s.pg.locator('h2:text-is("Invite a member")').locator('xpath=..')]]);
      await save(s.pg, name, title, ['Members and their roles', 'Change a member’s role', 'Join links & QR codes', 'Invite a member by email'], { full: true, maxH: 1600 });
    } else await save(s.pg, name, title, [], { full: true, maxH: 1300 });
  }
  // workflows, attendance, documents, desks, facilities, permits, tenant experience, inbox, security, surveys
  for (const [route, name, title] of [['/workflows', 'workflows', 'Workflows'], ['/attendance', 'attendance', 'Technician attendance'], ['/documents', 'documents', 'Documents'], ['/desks', 'desks', 'Desk booking'], ['/facilities', 'facilities', 'Facility booking'], ['/permits', 'permits', 'Permits to work'], ['/tenant-experience', 'tenant-experience', 'Tenant experience — announcements'], ['/inbox', 'inbox', 'Inbox'], ['/security', 'security', 'Security & notification settings'], ['/surveys', 'surveys', 'Surveys'], ['/billing', 'billing', 'Billing'], ['/checklists', 'checklists', 'Checklists'], ['/support', 'support', 'Help & support']]) {
    await go(s.pg, route); await save(s.pg, name, title, [], { full: true, maxH: 1100 });
  }
  // help drawer on the work order page
  await go(s.pg, `/work-orders/${IDS.woLive}`); await s.pg.locator('[data-tour=help]').click(); await s.pg.waitForTimeout(400);
  await mark(s.pg, [[1, '[data-testid=help-drawer] h2'], [2, s.pg.locator('[data-testid=help-drawer] h3').first()], [3, s.pg.locator('[data-testid=help-drawer] a:has-text("Read the full guide")')], [4, s.pg.locator('[data-testid=help-drawer] button:has-text("Take the tour")')]]);
  await save(s.pg, 'help-drawer', 'The “? Help” panel', ['Which page this help is for', 'What you can do and what the fields mean', 'Read the full guide section', 'Take the tour']);
  await s.ctx.close();
  // tour (fresh user state)
  s = await mk(browser, 'priya', { tour: true });
  await go(s.pg, '/'); await s.pg.waitForTimeout(1500);
  await s.pg.locator('[data-testid=product-tour] button:has-text("Next")').click().catch(() => {}); await s.pg.waitForTimeout(400);
  await mark(s.pg, [[1, '[data-testid=product-tour] [role=dialog] p >> nth=0'], [2, s.pg.locator('[data-testid=product-tour] label')], [3, s.pg.locator('[data-testid=product-tour] button:has-text("Skip tour")').last()], [4, s.pg.locator('[data-testid=product-tour] button:has-text("Previous")')], [5, s.pg.locator('[data-testid=product-tour] button:has-text("Next")')]]);
  await save(s.pg, 'tour', 'The guided tour', ['Step counter', 'Don’t show this tour again', 'Skip tour', 'Previous', 'Next / Finish']);
  await s.ctx.close();
  // technician
  s = await mk(browser, 'minh');
  await go(s.pg, '/my-work');
  await mark(s.pg, [[1, s.pg.locator('main a[href^="/work-orders/"]').first()]]);
  await save(s.pg, 'my-work', 'My work (Technician)', ['Your assigned work order — priority, status and due date'], { maxH: 700, full: true });
  await s.ctx.close();
  // tenant
  s = await mk(browser, 'olivia');
  await go(s.pg, '/');
  await mark(s.pg, [[1, '[data-tour=report-fault]'], [2, s.pg.locator('main a[href="/requests"]').first()], [3, s.pg.locator('text=Announcements').first()]]);
  await save(s.pg, 'tenant-home', 'Tenant home (Occupant)', ['Report a fault', 'My requests — view all', 'Announcements from building management'], { full: true, maxH: 1100 });
  await go(s.pg, '/requests/new');
  await mark(s.pg, [[1, label(s.pg, 'Summary').locator('input')], [2, label(s.pg, 'Fault type').locator('input')], [3, label(s.pg, 'Severity').locator('select')], [4, label(s.pg, 'Location').locator('input')], [5, s.pg.locator('main textarea')], [6, label(s.pg, 'Photo').locator('input')], [7, 'button[type=submit]']]);
  await save(s.pg, 'request-new', 'Report a fault form', ['Summary', 'Fault type', 'Severity', 'Location', 'Description', 'Photo (optional)', 'Submit report'], { full: true, maxH: 1200 });
  await s.ctx.close();
  // phone view
  s = await mk(browser, 'minh', { W: 390, h: 844 });
  await go(s.pg, '/');
  await save(s.pg, 'mobile-dashboard', 'FacilityPro on a phone', []);
  await s.ctx.close();
  if (LANG === 'en') fs.writeFileSync(path.join(OUTDIR, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await browser.close(); server.close();
})();
