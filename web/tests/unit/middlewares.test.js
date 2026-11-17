'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('../helpers/http');
const { requireLogin, requireAdmin, clientIp } = require('../../src/middlewares/auth');
const { csrfToken, verifyCsrf } = require('../../src/middlewares/csrf');
const { notFound, errorHandler } = require('../../src/middlewares/errorHandler');
const { proofUploadError } = require('../../src/middlewares/upload');

describe('auth middleware', () => {
  it('requireLogin redirects anonymous users to /login and lets users through', () => {
    const res = fakeRes();
    const next = mock.fn();
    requireLogin(fakeReq(), res, next);
    assert.equal(res.redirectedTo, '/login');
    assert.equal(next.mock.callCount(), 0);
    requireLogin(fakeReq({ session: { user: { code: 'F001' } } }), fakeRes(), next);
    assert.equal(next.mock.callCount(), 1);
  });
  it('requireAdmin: anonymous -> /login, normal user -> 403, admin -> next', () => {
    const anon = fakeRes();
    requireAdmin(fakeReq(), anon, mock.fn());
    assert.equal(anon.redirectedTo, '/login');
    const normal = fakeRes();
    requireAdmin(fakeReq({ session: { user: { role: 'user' } } }), normal, mock.fn());
    assert.equal(normal.statusCode, 403);
    const next = mock.fn();
    requireAdmin(fakeReq({ session: { user: { role: 'admin' } } }), fakeRes(), next);
    assert.equal(next.mock.callCount(), 1);
  });
  it('clientIp prefers req.ip and falls back to the socket address', () => {
    assert.equal(clientIp({ ip: '1.1.1.1', socket: { remoteAddress: '2.2.2.2' } }), '1.1.1.1');
    assert.equal(clientIp({ socket: { remoteAddress: '2.2.2.2' } }), '2.2.2.2');
  });
});

describe('csrf middleware', () => {
  it('csrfToken creates a token once per session', () => {
    const req = fakeReq();
    const first = csrfToken(req);
    assert.equal(first.length, 48);
    assert.equal(csrfToken(req), first);
  });
  it('verifyCsrf accepts the matching token', () => {
    const req = fakeReq({ session: { csrf: 'abc' }, body: { _csrf: 'abc' } });
    const next = mock.fn();
    verifyCsrf(req, fakeRes(), next);
    assert.equal(next.mock.callCount(), 1);
  });
  for (const [name, session, body] of [
    ['a missing token', { csrf: 'abc' }, {}],
    ['a wrong token', { csrf: 'abc' }, { _csrf: 'abd' }],
    ['a token of another length', { csrf: 'abc' }, { _csrf: 'abcd' }],
    ['a session without a token', {}, { _csrf: 'abc' }],
  ]) {
    it(`verifyCsrf rejects ${name} with 403`, () => {
      const res = fakeRes();
      const next = mock.fn();
      verifyCsrf(fakeReq({ session, body }), res, next);
      assert.equal(res.statusCode, 403);
      assert.equal(next.mock.callCount(), 0);
    });
  }
});

describe('error handler', () => {
  it('notFound renders a 404 page', () => {
    const res = fakeRes();
    notFound(fakeReq(), res);
    assert.equal(res.statusCode, 404);
  });
  it('errorHandler answers JSON for /api/ and a page elsewhere, without leaking the error', (t) => {
    t.mock.method(console, 'error', () => {});
    const api = fakeRes();
    errorHandler(new Error('secret detail'), { path: '/api/runs' }, api, () => {});
    assert.equal(api.statusCode, 500);
    assert.deepEqual(api.body, { error: 'internal' });
    const page = fakeRes();
    errorHandler(new Error('secret detail'), { path: '/runs' }, page, () => {});
    assert.equal(page.statusCode, 500);
    assert.doesNotMatch(JSON.stringify(page.rendered), /secret detail/);
  });
});

describe('proofUpload errors', () => {
  it('returns 400 JSON when the URL is under /api/', () => {
    const req = fakeReq();
    req.originalUrl = '/api/runs';
    const res = fakeRes();
    proofUploadError({ code: 'LIMIT_FILE_SIZE' }, req, res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Image too large (max 5MB)' });
    assert.equal(res.rendered, null);
  });
  it('still renders the EJS upload form outside /api/', () => {
    const req = fakeReq();
    req.originalUrl = '/upload';
    const res = fakeRes();
    proofUploadError({ code: 'LIMIT_FILE_SIZE' }, req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.rendered.view, 'runs/upload');
    assert.equal(res.rendered.data.error, 'Image too large (max 5MB)');
  });
});
