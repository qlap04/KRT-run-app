'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { auditKeys } = require('../../src/models/AuditLog');

test('audit keys: newest sorts first, date partition', () => {
  const a = auditKeys(new Date('2026-11-16T01:00:00Z'));
  const b = auditKeys(new Date('2026-11-16T02:00:00Z'));
  assert.equal(a.partitionKey, '2026-11-16');
  assert.ok(b.rowKey < a.rowKey);
});
