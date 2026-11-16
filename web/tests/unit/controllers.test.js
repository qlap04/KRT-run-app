'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('../helpers/http');
const { createApiController } = require('../../src/controllers/apiController');
const { createAuthController } = require('../../src/controllers/authController');
const { createAdminController } = require('../../src/controllers/adminController');

describe('apiController', () => {
  const make = (cfg = {}) => createApiController({ cfg: { appEnv: 'dev', apiKey: 'k-123', ...cfg }, runService: {} });
  const run = (controller, req) => {
    const res = fakeRes();
    const next = mock.fn();
    controller.apiAuth(req, res, next);
    return { res, next };
  };

  it('health reports status and environment', () => {
    const res = fakeRes();
    make().health(fakeReq(), res);
    assert.equal(res.body.status, 'ok');
    assert.equal(res.body.env, 'dev');
  });
  it('apiAuth lets a valid API key through with access to all runs', () => {
    const req = fakeReq({ headers: { 'x-api-key': 'k-123' } });
    const { next } = run(make(), req);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(req.apiAll, true);
  });
  it('apiAuth lets a logged-in session through without apiAll', () => {
    const req = fakeReq({ session: { user: { code: 'F001' } } });
    const { next } = run(make(), req);
    assert.equal(next.mock.callCount(), 1);
    assert.equal(req.apiAll, undefined);
  });
  it('apiAuth answers 401 for a wrong key and no session', () => {
    const { res, next } = run(make(), fakeReq({ headers: { 'x-api-key': 'wrong' } }));
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
    assert.equal(next.mock.callCount(), 0);
  });
  it('apiAuth never accepts an empty key even when API_KEY is not configured', () => {
    const { res } = run(make({ apiKey: '' }), fakeReq({ headers: { 'x-api-key': '' } }));
    assert.equal(res.statusCode, 401);
  });
  it('runs passes the query and the auth context to the service and returns JSON', async () => {
    const runService = { apiRuns: mock.fn(async () => ({ month: '2026-11', runs: [] })) };
    const controller = createApiController({ cfg: {}, runService });
    const res = fakeRes();
    await controller.runs(fakeReq({ query: { month: '2026-11' }, session: { user: { code: 'F001' } } }), res, mock.fn());
    assert.deepEqual(res.body, { month: '2026-11', runs: [] });
    assert.equal(runService.apiRuns.mock.calls[0].arguments[0].monthQuery, '2026-11');
  });
  it('forwards service errors to next()', async () => {
    const boom = new Error('boom');
    const controller = createApiController({ cfg: {}, runService: { apiLeaderboard: async () => { throw boom; } } });
    const next = mock.fn();
    await controller.leaderboard(fakeReq(), fakeRes(), next);
    assert.equal(next.mock.calls[0].arguments[0], boom);
  });
});

describe('authController', () => {
  it('login failure renders the form with 401', async () => {
    const authService = { login: async () => ({ ok: false, error: 'Wrong employee code or password', code: 'F001' }) };
    const res = fakeRes();
    await createAuthController({ authService }).login(fakeReq({ body: { employeeCode: 'F001', password: 'x' } }), res, mock.fn());
    assert.equal(res.statusCode, 401);
    assert.equal(res.rendered.view, 'auth/login');
    assert.equal(res.rendered.data.code, 'F001');
  });
  it('login success regenerates the session, stores the user and redirects to /runs', async () => {
    const authService = {
      login: async () => ({ ok: true, sessionUser: { code: 'F001', role: 'user' }, code: 'F001', clientIp: '1.1.1.1' }),
      recordLoginSuccess: mock.fn(),
    };
    const req = fakeReq({ body: { employeeCode: 'F001', password: 'x' } });
    req.session.regenerate = (cb) => { req.session = { regenerate: req.session.regenerate }; cb(); };
    const res = fakeRes();
    await createAuthController({ authService }).login(req, res, mock.fn());
    assert.deepEqual(req.session.user, { code: 'F001', role: 'user' });
    assert.equal(res.redirectedTo, '/runs');
    assert.equal(authService.recordLoginSuccess.mock.callCount(), 1);
  });
  it('register failure renders the form with 400 and register success redirects to /login', async () => {
    const failing = createAuthController({ authService: { register: async () => ({ ok: false, error: 'x', form: { employeeCode: 'a' } }) } });
    const res1 = fakeRes();
    await failing.register(fakeReq(), res1, mock.fn());
    assert.equal(res1.statusCode, 400);
    const passing = createAuthController({ authService: { register: async () => ({ ok: true }) } });
    const res2 = fakeRes();
    await passing.register(fakeReq(), res2, mock.fn());
    assert.equal(res2.redirectedTo, '/login');
  });
  it('logout destroys the session and redirects to /login', () => {
    const req = fakeReq();
    req.session.destroy = (cb) => cb();
    const res = fakeRes();
    createAuthController({ authService: {} }).logout(req, res);
    assert.equal(res.redirectedTo, '/login');
  });
});

describe('adminController', () => {
  const make = (result) => {
    const runService = { review: mock.fn(async () => result) };
    return { runService, controller: createAdminController({ runService, auditService: {} }) };
  };
  const req = () => fakeReq({
    params: { month: '2026-11', runId: 'r1' }, body: { note: 'ok' }, session: { user: { code: 'ADM01' } },
  });

  it('approve calls the service with APPROVED and redirects to the month', async () => {
    const { controller, runService } = make({ ok: true, month: '2026-11' });
    const res = fakeRes();
    await controller.approve(req(), res, mock.fn());
    assert.equal(runService.review.mock.calls[0].arguments[0].newStatus, 'APPROVED');
    assert.equal(runService.review.mock.calls[0].arguments[0].actor, 'ADM01');
    assert.equal(res.redirectedTo, '/admin?month=2026-11');
  });
  it('reject calls the service with REJECTED', async () => {
    const { controller, runService } = make({ ok: true, month: '2026-11' });
    await controller.reject(req(), fakeRes(), mock.fn());
    assert.equal(runService.review.mock.calls[0].arguments[0].newStatus, 'REJECTED');
  });
  it('maps notFound to 404 and conflict to 409', async () => {
    const res404 = fakeRes();
    await make({ notFound: true }).controller.approve(req(), res404, mock.fn());
    assert.equal(res404.statusCode, 404);
    const res409 = fakeRes();
    await make({ conflict: true, message: 'm' }).controller.approve(req(), res409, mock.fn());
    assert.equal(res409.statusCode, 409);
    assert.equal(res409.rendered.data.message, 'm');
  });
});
