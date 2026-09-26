// Opens every page as each demo role (admin, manager, technician, occupant, vendor) and reports console errors, failed API calls and error screens.
// Run with: node scripts/help/run.cjs (see docs/USER_GUIDE.md). Uses the demo organisation from supabase/seed/tenant_demo.sql.
const U = Object.fromEntries(sql("select split_part(u.email,'.',1), u.id from auth.users u where u.email like '%harbourview-demo.test'").split('\n').map(l => l.split('|')));
const org = sql("select id from fp_organizations where settings->>'demo_key'='harbourview'");
const one = (q) => sql(q);
const ids = {
  wo: one(`select id from fp_work_orders where org_id='${org}' and title like 'Chiller CH-01 high%'`),
  req: one(`select id from fp_requests where org_id='${org}' and title like 'Suite 1201%'`),
  asset: one(`select id from fp_assets where org_id='${org}' and serial='CH01-2019-4471'`),
  cl: one(`select id from fp_checklist_templates where org_id='${org}' limit 1`),
  dev: one(`select id from fp_devices where org_id='${org}' and name like 'CH-01%'`),
};
const staff = ['/', '/my-work', '/requests', '/requests/new', `/requests/${ids.req}`, '/work-orders', `/work-orders/${ids.wo}`, `/work-orders/${ids.wo}/print`, '/inbox', '/assets', `/assets/${ids.asset}`,
  '/maintenance', '/checklists', `/checklists/${ids.cl}`, '/desks', '/facilities', '/parts', '/vendors', '/locations', '/security', '/documents', '/permits', '/attendance',
  '/smart-assistant', '/tenant-experience', '/support', '/devices', `/devices/${ids.dev}`, '/approvals', '/workflows', '/surveys', '/reports', '/billing', '/settings', '/financial'];
const occ = ['/', '/requests', '/requests/new', `/requests/${ids.req}`];
(async () => {
  const browser = await chromium.launch();
  const roles = process.argv[2] ? process.argv[2].split(',') : ['alex', 'priya', 'minh', 'olivia', 'rahul'];
  const report = [];
  for (const who of roles) {
    const { ctx, pg, errs } = await ctxFor(browser, U[who], { email: who + '@harbourview-demo.test', name: who });
    for (const r of (who === 'olivia' ? occ : staff)) {
      errs.length = 0;
      await pg.goto(BASE + r); await pg.waitForLoadState('networkidle').catch(() => {}); await pg.waitForTimeout(700);
      const url = pg.url().replace(BASE, '');
      const body = await pg.locator('body').innerText();
      const flags = [];
      if (await loadErrors(pg)) flags.push('LOAD-ERROR');
      if (/Something went wrong|Page not found|Không tìm thấy/i.test(body)) flags.push('ERROR-SCREEN');
      if (url !== r) flags.push('REDIRECT→' + url);
      if (errs.length) flags.push(...[...new Set(errs)].slice(0, 4));
      report.push(`${who}\t${r}\t${flags.join(' | ') || 'ok'}`);
      await shot(pg, `${who}_${r.replace(/\//g, '_').replace(/[0-9a-f-]{36}/, 'id') || 'home'}`);
    }
    await ctx.close();
  }
  console.log(report.join('\n')); await browser.close(); server.close();
})();
