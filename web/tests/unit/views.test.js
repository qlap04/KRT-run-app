'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ejs = require('ejs');

const viewsDir = path.join(__dirname, '..', '..', 'src', 'views');
const render = (view, data = {}) => ejs.renderFile(path.join(viewsDir, `${view}.ejs`), {
  user: null, csrf: 'token', appEnv: 'dev', ...data,
});

describe('views render without errors (includes resolve)', () => {
  const cases = [
    ['error', { message: 'Oops' }],
    ['auth/login', { error: null, code: '' }],
    ['auth/register', { error: null, form: {} }],
    ['runs/runs', { month: '2026-11', list: [{ rowKey: 'r', partitionKey: '2026-11', runDate: '2026-11-01', km: 5, status: 'APPROVED' }], approvedKm: 5, pendingKm: 0 }],
    ['runs/upload', { error: null, form: {}, today: '2026-11-16', ok: false }],
    ['runs/leaderboard', { month: '2026-11', rows: [{ employeeCode: 'A', fullName: 'Ann', km: 5, runs: 1 }] }],
    ['admin/admin', { month: '2026-11', list: [] }],
    ['admin/audit', { date: '2026-11-16', rows: [{ action: 'LOGIN', actor: 'A', timestamp: '2026-11-16T01:02:03Z' }] }],
  ];
  for (const [view, data] of cases) {
    it(`renders ${view}`, async () => {
      const html = await render(view, data);
      assert.match(html, /<html/);
      assert.match(html, /<\/html>/);
    });
  }
});

describe('views escape user data', () => {
  it('escapes HTML in names and messages', async () => {
    const xss = '<script>alert(1)</script>';
    const board = await render('runs/leaderboard', { month: '2026-11', rows: [{ employeeCode: 'A', fullName: xss, km: 1, runs: 1 }] });
    assert.ok(!board.includes(xss));
    assert.match(board, /&lt;script&gt;/);
    const err = await render('error', { message: xss });
    assert.ok(!err.includes(xss));
  });
  it('shows the admin links only to admins', async () => {
    const asUser = await render('error', { message: 'x', user: { code: 'U', fullName: 'U', role: 'user' } });
    const asAdmin = await render('error', { message: 'x', user: { code: 'A', fullName: 'A', role: 'admin' } });
    assert.ok(!asUser.includes('/admin'));
    assert.match(asAdmin, /\/admin\/audit/);
  });
});
