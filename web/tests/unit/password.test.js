'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../../src/services/authService');

describe('password hashing', () => {
  it('stores a bcrypt hash, never the plain password', async () => {
    const hash = await hashPassword('Secret123!');
    assert.notEqual(hash, 'Secret123!');
    assert.match(hash, /^\$2[aby]\$/);
  });
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('Secret123!');
    assert.equal(await verifyPassword('Secret123!', hash), true);
    assert.equal(await verifyPassword('wrong-pass', hash), false);
  });
  it('uses a random salt, so the same password gives different hashes', async () => {
    assert.notEqual(await hashPassword('Secret123!'), await hashPassword('Secret123!'));
  });
  it('treats a missing hash as a failed verification', async () => {
    assert.equal(await verifyPassword('x', undefined), false);
    assert.equal(await verifyPassword('x', ''), false);
  });
});
