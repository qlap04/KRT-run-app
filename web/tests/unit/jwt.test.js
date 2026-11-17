'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { fakeReq, fakeRes } = require('../helpers/http');
const { createJwt } = require('../../src/middlewares/jwt');

const cfg = { sessionSecret: 'test-session-secret-for-jwt' };
const { signToken, requireAuth, requireAdminApi } = createJwt({ cfg });

describe('signToken', () => {
  it('signs a HS256 token with code and role that expires in about 1h', () => {
    const token = signToken({ code: 'F001', role: 'user' });
    const decoded = jwt.verify(token, cfg.sessionSecret, { algorithms: ['HS256'] });
    assert.equal(decoded.code, 'F001');
    assert.equal(decoded.role, 'user');
    assert.equal(jwt.decode(token, { complete: true }).header.alg, 'HS256');
    const ttl = decoded.exp - decoded.iat;
    assert.ok(ttl >= 3500 && ttl <= 3700);
  });
});

describe('requireAuth', () => {
  it('accepts a valid Bearer token and sets req.user', () => {
    const token = signToken({ code: 'F001', role: 'user' });
    const req = fakeReq({ headers: { authorization: `Bearer ${token}` } });
    const next = mock.fn();
    requireAuth(req, fakeRes(), next);
    assert.equal(next.mock.callCount(), 1);
    assert.deepEqual(req.user, { code: 'F001', role: 'user' });
  });

  for (const [name, headers] of [
    ['a missing Authorization header', {}],
    ['a non-Bearer scheme', { authorization: 'Basic abc' }],
    ['an empty Bearer token', { authorization: 'Bearer ' }],
    ['a malformed token', { authorization: 'Bearer not-a-jwt' }],
    ['a token signed with another secret', {
      authorization: `Bearer ${jwt.sign({ code: 'F001', role: 'user' }, 'other-secret', { expiresIn: '1h', algorithm: 'HS256' })}`,
    }],
    ['an expired token', {
      authorization: `Bearer ${jwt.sign(
        { code: 'F001', role: 'user', exp: Math.floor(Date.now() / 1000) - 10 },
        cfg.sessionSecret,
        { algorithm: 'HS256' },
      )}`,
    }],
  ]) {
    it(`rejects ${name} with 401 JSON`, () => {
      const res = fakeRes();
      const next = mock.fn();
      requireAuth(fakeReq({ headers }), res, next);
      assert.equal(res.statusCode, 401);
      assert.deepEqual(res.body, { error: 'unauthorized' });
      assert.equal(next.mock.callCount(), 0);
    });
  }
});

describe('requireAdminApi', () => {
  it('lets an admin through', () => {
    const req = fakeReq();
    req.user = { code: 'A001', role: 'admin' };
    const next = mock.fn();
    requireAdminApi(req, fakeRes(), next);
    assert.equal(next.mock.callCount(), 1);
  });

  it('rejects a missing user with 403 JSON', () => {
    const res = fakeRes();
    const next = mock.fn();
    requireAdminApi(fakeReq(), res, next);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'forbidden' });
    assert.equal(next.mock.callCount(), 0);
  });

  it('rejects a non-admin with 403 JSON', () => {
    const req = fakeReq();
    req.user = { code: 'F001', role: 'user' };
    const res = fakeRes();
    const next = mock.fn();
    requireAdminApi(req, res, next);
    assert.equal(res.statusCode, 403);
    assert.deepEqual(res.body, { error: 'forbidden' });
    assert.equal(next.mock.callCount(), 0);
  });
});
