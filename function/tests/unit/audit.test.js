'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { appendAudit } = require('../../src/lib/audit');

describe('appendAudit', () => {
  const run = async (fields) => {
    const table = { createEntity: mock.fn(async () => {}) };
    await appendAudit(table, fields);
    assert.equal(table.createEntity.mock.callCount(), 1);
    return table.createEntity.mock.calls[0].arguments[0];
  };

  it('inserts one entity with defaults', async () => {
    const e = await run({ action: 'PROCESSED', actor: 'function' });
    assert.equal(e.action, 'PROCESSED');
    assert.equal(e.result, 'OK');
    assert.equal(e.km, '');
    assert.match(e.partitionKey, /^\d{4}-\d{2}-\d{2}$/);
    assert.match(e.rowKey, /^\d{13}_[0-9a-f-]{36}$/);
  });
  it('converts km to a number', async () => {
    assert.equal((await run({ action: 'A', actor: 'f', km: '5.5' })).km, 5.5);
  });
  it('truncates detail to 500 characters', async () => {
    assert.equal((await run({ action: 'A', actor: 'f', detail: 'x'.repeat(800) })).detail.length, 500);
  });
  it('uses the reverse timestamp so the newest entry sorts first', async (t) => {
    t.mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 16, 1) });
    const older = await run({ action: 'A', actor: 'f' });
    t.mock.timers.tick(1000);
    const newer = await run({ action: 'A', actor: 'f' });
    assert.ok(newer.rowKey < older.rowKey);
    assert.equal(older.partitionKey, '2026-11-16');
  });
});
