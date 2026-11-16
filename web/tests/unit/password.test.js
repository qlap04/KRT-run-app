'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { hashPassword, verifyPassword } = require('../../src/services/authService');

test('hash is not plain and verifies', async () => {
  const h = await hashPassword('Secret123!');
  assert.notEqual(h, 'Secret123!');
  assert.match(h, /^\$2[aby]\$/);
  assert.ok(await verifyPassword('Secret123!', h));
  assert.ok(!(await verifyPassword('wrong-pass', h)));
});
test('same password gives different hashes (salt)', async () => {
  assert.notEqual(await hashPassword('Secret123!'), await hashPassword('Secret123!'));
});
test('missing hash is false', async () => {
  assert.equal(await verifyPassword('x', undefined), false);
});
