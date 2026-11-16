'use strict';
const { describe, it, before, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createAuthService, hashPassword } = require('../../src/services/authService');

describe('authService', () => {
  let hash;
  before(async () => { hash = await hashPassword('Password1'); });

  const setup = ({ user = null, createError = null, adminCode = '' } = {}) => {
    const users = {
      get: mock.fn(async () => user),
      create: mock.fn(async () => { if (createError) throw createError; }),
    };
    const audit = { append: mock.fn(async () => {}) };
    const service = createAuthService({ cfg: { adminCode }, users, audit });
    return { users, audit, service };
  };
  const auditActions = (audit) => audit.append.mock.calls.map((c) => c.arguments[0]);

  describe('login', () => {
    const user = () => ({ rowKey: 'F001', fullName: 'Ann', role: 'user', passwordHash: hash });

    it('returns the session user for the right password', async () => {
      const { service } = setup({ user: user() });
      const r = await service.login({ employeeCode: ' F001 ', password: 'Password1', clientIp: '1.2.3.4' });
      assert.equal(r.ok, true);
      assert.deepEqual(r.sessionUser, { code: 'F001', fullName: 'Ann', role: 'user' });
    });
    it('fails and audits a wrong password', async () => {
      const { service, audit } = setup({ user: user() });
      const r = await service.login({ employeeCode: 'F001', password: 'nope', clientIp: '1.2.3.4' });
      assert.equal(r.ok, false);
      assert.equal(r.error, 'Wrong employee code or password');
      assert.deepEqual(auditActions(audit).map((a) => [a.action, a.result, a.actor]), [['LOGIN', 'FAILED', 'F001']]);
    });
    it('gives the same error for an unknown user (no user enumeration)', async () => {
      const { service } = setup({ user: null });
      const r = await service.login({ employeeCode: 'F404', password: 'Password1' });
      assert.equal(r.error, 'Wrong employee code or password');
    });
    it('does not query storage for a malformed employee code', async () => {
      const { service, users } = setup();
      const r = await service.login({ employeeCode: "a' or 1=1", password: 'x' });
      assert.equal(r.ok, false);
      assert.equal(users.get.mock.callCount(), 0);
    });
  });

  describe('register', () => {
    const form = { employeeCode: 'F002', fullName: 'Bob', password: 'Password1', password2: 'Password1', clientIp: '1.2.3.4' };

    it('creates a user with a hashed password and audits REGISTER', async () => {
      const { service, users, audit } = setup();
      assert.deepEqual(await service.register(form), { ok: true });
      const created = users.create.mock.calls[0].arguments[0];
      assert.equal(created.code, 'F002');
      assert.equal(created.role, 'user');
      assert.notEqual(created.passwordHash, 'Password1');
      assert.match(created.passwordHash, /^\$2[aby]\$/);
      assert.equal(auditActions(audit)[0].action, 'REGISTER');
    });
    it('gives the admin role when the code equals ADMIN_CODE', async () => {
      const { service, users } = setup({ adminCode: 'F002' });
      await service.register(form);
      assert.equal(users.create.mock.calls[0].arguments[0].role, 'admin');
    });
    it('never makes anyone admin when ADMIN_CODE is empty', async () => {
      const { service, users } = setup({ adminCode: '' });
      await service.register(form);
      assert.equal(users.create.mock.calls[0].arguments[0].role, 'user');
    });
    for (const [name, patch, message] of [
      ['a bad employee code', { employeeCode: 'x' }, /Employee code must be/],
      ['an empty name', { fullName: '   ' }, /full name/],
      ['a short password', { password: 'short', password2: 'short' }, /8 to 72/],
      ['a password mismatch', { password2: 'Different1' }, /do not match/],
    ]) {
      it(`rejects ${name} without touching storage`, async () => {
        const { service, users } = setup();
        const r = await service.register({ ...form, ...patch });
        assert.equal(r.ok, false);
        assert.match(r.error, message);
        assert.equal(users.create.mock.callCount(), 0);
      });
    }
    it('reports a duplicate employee code (409)', async () => {
      const { service, audit } = setup({ createError: Object.assign(new Error('exists'), { statusCode: 409 }) });
      const r = await service.register(form);
      assert.equal(r.error, 'Employee code is already registered');
      assert.equal(audit.append.mock.callCount(), 0);
    });
    it('rethrows unexpected storage errors', async () => {
      const { service } = setup({ createError: Object.assign(new Error('boom'), { statusCode: 500 }) });
      await assert.rejects(service.register(form), /boom/);
    });
  });
});
