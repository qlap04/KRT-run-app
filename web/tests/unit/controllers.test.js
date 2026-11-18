'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('../helpers/http');
const { createApiController } = require('../../src/controllers/apiController');
const { createAdminApiController } = require('../../src/controllers/adminApiController');

describe('apiController', () => {
  const denyAuth = (req, res) => res.status(401).json({ error: 'unauthorized' });
  const make = (cfg = {}, extras = {}) => createApiController({
    cfg: { appEnv: 'dev', apiKey: 'k-123', ...cfg },
    runService: {},
    requireAuth: denyAuth,
    ...extras,
  });
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
  it('apiAuth falls back to requireAuth for a Bearer JWT and sets req.user', () => {
    const requireAuth = (req, res, next) => {
      req.user = { code: 'F001', role: 'user' };
      next();
    };
    const req = fakeReq({ headers: { authorization: 'Bearer token' } });
    const { next } = run(make({}, { requireAuth }), req);
    assert.equal(next.mock.callCount(), 1);
    assert.deepEqual(req.user, { code: 'F001', role: 'user' });
    assert.equal(req.apiAll, undefined);
  });
  it('apiAuth answers 401 for a wrong key and failed Bearer auth', () => {
    const { res, next } = run(make(), fakeReq({ headers: { 'x-api-key': 'wrong' } }));
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'unauthorized' });
    assert.equal(next.mock.callCount(), 0);
  });
  it('apiAuth never accepts an empty key even when API_KEY is not configured', () => {
    const { res } = run(make({ apiKey: '' }), fakeReq({ headers: { 'x-api-key': '' } }));
    assert.equal(res.statusCode, 401);
  });
  it('login returns a token and user on success', async () => {
    const sessionUser = { code: 'F001', fullName: 'Ann', role: 'user' };
    const authService = {
      login: mock.fn(async () => ({ ok: true, sessionUser, code: 'F001', clientIp: '203.0.113.7' })),
      recordLoginSuccess: mock.fn(),
    };
    const signToken = mock.fn(() => 'jwt-token');
    const controller = make({}, { authService, signToken });
    const res = fakeRes();
    await controller.login(fakeReq({ body: { employeeCode: 'F001', password: 'Password1' } }), res, mock.fn());
    assert.deepEqual(res.body, { token: 'jwt-token', user: sessionUser });
    assert.deepEqual(signToken.mock.calls[0].arguments[0], sessionUser);
    assert.equal(authService.recordLoginSuccess.mock.callCount(), 1);
  });
  it('login answers 401 JSON when credentials are wrong', async () => {
    const authService = {
      login: async () => ({ ok: false, error: 'Wrong employee code or password', code: 'F001' }),
    };
    const res = fakeRes();
    await make({}, { authService, signToken: () => '' }).login(fakeReq({ body: {} }), res, mock.fn());
    assert.equal(res.statusCode, 401);
    assert.deepEqual(res.body, { error: 'Wrong employee code or password' });
  });
  it('register answers 400 JSON for validation errors and 409 for duplicates', async () => {
    const bad = make({}, {
      authService: { register: async () => ({ ok: false, error: 'Please enter your full name', form: {} }) },
    });
    const res400 = fakeRes();
    await bad.register(fakeReq({ body: {} }), res400, mock.fn());
    assert.equal(res400.statusCode, 400);
    assert.deepEqual(res400.body, { error: 'Please enter your full name' });

    const conflict = make({}, {
      authService: {
        register: async () => ({
          ok: false, statusCode: 409, error: 'Employee code is already registered', form: {},
        }),
      },
    });
    const res409 = fakeRes();
    await conflict.register(fakeReq({ body: {} }), res409, mock.fn());
    assert.equal(res409.statusCode, 409);
    assert.deepEqual(res409.body, { error: 'Employee code is already registered' });
  });
  it('register returns ok on success', async () => {
    const authService = { register: async () => ({ ok: true }) };
    const res = fakeRes();
    await make({}, { authService }).register(fakeReq({ body: {} }), res, mock.fn());
    assert.deepEqual(res.body, { ok: true });
  });
  it('me returns req.user', () => {
    const res = fakeRes();
    const req = fakeReq();
    req.user = { code: 'F001', role: 'user' };
    make().me(req, res);
    assert.deepEqual(res.body, { code: 'F001', role: 'user' });
  });
  it('runs passes the query and req.user to the service and returns JSON', async () => {
    const runService = { apiRuns: mock.fn(async () => ({ month: '2026-11', runs: [] })) };
    const controller = createApiController({ cfg: {}, runService, requireAuth: denyAuth });
    const res = fakeRes();
    const req = fakeReq({ query: { month: '2026-11' } });
    req.user = { code: 'F001', role: 'user' };
    await controller.runs(req, res, mock.fn());
    assert.deepEqual(res.body, { month: '2026-11', runs: [] });
    assert.deepEqual(runService.apiRuns.mock.calls[0].arguments[0], {
      monthQuery: '2026-11',
      apiAll: undefined,
      sessionUser: req.user,
    });
  });
  it('upload returns 201 on success and 400 JSON on validation errors', async () => {
    const user = { code: 'F001', role: 'user' };
    const okService = {
      upload: mock.fn(async () => ({ ok: true })),
    };
    const okReq = fakeReq({ body: { km: '5', runDate: '2026-11-01' } });
    okReq.user = user;
    okReq.file = { buffer: Buffer.from([1]), originalname: 'a.jpg' };
    const okRes = fakeRes();
    await make({}, { runService: okService }).upload(okReq, okRes, mock.fn());
    assert.equal(okRes.statusCode, 201);
    assert.deepEqual(okRes.body, { ok: true });
    assert.equal(okService.upload.mock.calls[0].arguments[0].user, user);

    const badService = { upload: async () => ({ ok: false, error: 'Distance must be between 0.1 and 100 km' }) };
    const badReq = fakeReq({ body: { km: '0' } });
    badReq.user = user;
    const badRes = fakeRes();
    await make({}, { runService: badService }).upload(badReq, badRes, mock.fn());
    assert.equal(badRes.statusCode, 400);
    assert.deepEqual(badRes.body, { error: 'Distance must be between 0.1 and 100 km' });
  });
  it('proof streams the image and answers 404 when missing', async () => {
    const stream = {
      on(event, fn) { if (event === 'error') this._onError = fn; return this; },
      pipe(dest) { this.dest = dest; return dest; },
    };
    const runService = {
      openProof: mock.fn(async () => ({ contentType: 'image/jpeg', stream })),
    };
    const req = fakeReq({ params: { month: '2026-11', runId: '11111111-1111-1111-1111-111111111111' } });
    req.user = { code: 'F001', role: 'user' };
    const res = fakeRes();
    await make({}, { runService }).proof(req, res, mock.fn());
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.equal(stream.dest, res);
    assert.equal(runService.openProof.mock.calls[0].arguments[0].user, req.user);

    const missing = fakeRes();
    await make({}, { runService: { openProof: async () => ({ notFound: true }) } })
      .proof(req, missing, mock.fn());
    assert.equal(missing.statusCode, 404);
  });
  it('forwards service errors to next()', async () => {
    const boom = new Error('boom');
    const controller = createApiController({
      cfg: {},
      runService: { apiLeaderboard: async () => { throw boom; } },
      requireAuth: denyAuth,
    });
    const next = mock.fn();
    await controller.leaderboard(fakeReq(), fakeRes(), next);
    assert.equal(next.mock.calls[0].arguments[0], boom);
  });
});

describe('adminApiController', () => {
  const make = ({ runService = {}, auditService = {} } = {}) => (
    createAdminApiController({ runService, auditService })
  );
  const adminReq = (extra = {}) => {
    const req = fakeReq({
      params: { month: '2026-11', runId: 'r1' },
      query: { month: '2026-11', date: '2026-11-17' },
      body: { note: 'ok' },
      ...extra,
    });
    req.user = { code: 'ADM01', fullName: 'Admin', role: 'admin' };
    return req;
  };

  it('reviewList returns pendingReview JSON', async () => {
    const data = { month: '2026-11', list: [] };
    const runService = { pendingReview: mock.fn(async () => data) };
    const res = fakeRes();
    await make({ runService }).reviewList(adminReq(), res, mock.fn());
    assert.deepEqual(res.body, data);
    assert.equal(runService.pendingReview.mock.calls[0].arguments[0], '2026-11');
  });

  it('auditLog returns listForDate JSON', async () => {
    const data = { date: '2026-11-17', entries: [] };
    const auditService = { listForDate: mock.fn(async () => data) };
    const res = fakeRes();
    await make({ auditService }).auditLog(adminReq(), res, mock.fn());
    assert.deepEqual(res.body, data);
    assert.equal(auditService.listForDate.mock.calls[0].arguments[0], '2026-11-17');
  });

  it('approve calls review with APPROVED and returns { ok: true }', async () => {
    const runService = { review: mock.fn(async () => ({ ok: true, month: '2026-11' })) };
    const res = fakeRes();
    await make({ runService }).approve(adminReq(), res, mock.fn());
    assert.deepEqual(res.body, { ok: true });
    assert.equal(runService.review.mock.calls[0].arguments[0].newStatus, 'APPROVED');
    assert.equal(runService.review.mock.calls[0].arguments[0].actor, 'ADM01');
    assert.equal(runService.review.mock.calls[0].arguments[0].note, 'ok');
  });

  it('reject calls review with REJECTED', async () => {
    const runService = { review: mock.fn(async () => ({ ok: true, month: '2026-11' })) };
    await make({ runService }).reject(adminReq(), fakeRes(), mock.fn());
    assert.equal(runService.review.mock.calls[0].arguments[0].newStatus, 'REJECTED');
  });

  it('maps notFound to 404 and conflict to 409 JSON', async () => {
    const res404 = fakeRes();
    await make({ runService: { review: async () => ({ notFound: true }) } })
      .approve(adminReq(), res404, mock.fn());
    assert.equal(res404.statusCode, 404);

    const res409 = fakeRes();
    await make({ runService: { review: async () => ({ conflict: true, message: 'already reviewed' }) } })
      .approve(adminReq(), res409, mock.fn());
    assert.equal(res409.statusCode, 409);
    assert.deepEqual(res409.body, { error: 'already reviewed' });
  });
});
