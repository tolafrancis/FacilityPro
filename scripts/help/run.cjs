#!/usr/bin/env node
// Help Center tooling — see docs/USER_GUIDE.md.
//   node scripts/help/run.cjs shots|crawl|workflows|help
// Needs: the demo seed in a local database, PostgREST + an auth stand-in on
// :54321, a build pointing at it, and `playwright` installed.
const fs = require('fs'); const path = require('path'); const os = require('os'); const { spawnSync } = require('child_process');
const scripts = { shots: 'shots.cjs', crawl: 'crawl.cjs', workflows: 'workflows.cjs', help: 'help-e2e.cjs' };
const which = process.argv[2];
if (!scripts[which]) { console.error('usage: node scripts/help/run.cjs ' + Object.keys(scripts).join('|')); process.exit(2); }
const root = path.resolve(__dirname, '..', '..');
const tmp = path.join(os.tmpdir(), `fp-help-${which}.cjs`);
fs.writeFileSync(tmp, fs.readFileSync(path.join(__dirname, 'harness.cjs'), 'utf8') + '\n' + fs.readFileSync(path.join(__dirname, scripts[which]), 'utf8'));
const r = spawnSync(process.execPath, [tmp, ...process.argv.slice(3)], { stdio: 'inherit', env: { ...process.env, HELP_ROOT: root, NODE_PATH: [path.join(root, 'node_modules'), process.env.NODE_PATH].filter(Boolean).join(path.delimiter) } });
process.exit(r.status ?? 1);
