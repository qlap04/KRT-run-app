'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { validateMessage, validateImage } = require('../../src/lib/validation');

const msg = { runId: '11111111-1111-1111-1111-111111111111', month: '2026-11', employeeCode: 'F001', blobName: '11111111-1111-1111-1111-111111111111.jpg' };

test('message validation', () => {
  assert.equal(validateMessage(msg), null);
  assert.ok(validateMessage({ ...msg, blobName: '../etc/passwd' }));
  assert.ok(validateMessage(null));
  assert.ok(validateImage(Buffer.alloc(6 * 1024 * 1024)).error);
});
