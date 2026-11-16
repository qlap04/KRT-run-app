'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createAuditService } = require('../../src/services/auditService');

describe('auditService.listForDate', () => {
  it('uses the requested date when it is well formed', async () => {
    const audit = { listByDate: mock.fn(async () => [{ action: 'LOGIN' }]) };
    const out = await createAuditService({ audit }).listForDate('2026-11-16');
    assert.equal(out.date, '2026-11-16');
    assert.deepEqual(out.rows, [{ action: 'LOGIN' }]);
    assert.equal(audit.listByDate.mock.calls[0].arguments[0], '2026-11-16');
  });
  it('falls back to today (Vietnam time) for a malformed date', async () => {
    const audit = { listByDate: mock.fn(async () => []) };
    const out = await createAuditService({ audit }).listForDate("2026-11-16' or 1=1");
    assert.match(out.date, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(audit.listByDate.mock.calls[0].arguments[0], out.date);
  });
});
