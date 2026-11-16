'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { auditKeys, createAuditLog } = require('../../src/models/AuditLog');

describe('AuditLog keys', () => {
  it('uses the UTC date as partition key', () => {
    assert.equal(auditKeys(new Date('2026-11-16T01:00:00Z')).partitionKey, '2026-11-16');
  });
  it('sorts the newest entry first (reverse timestamp row key)', () => {
    const older = auditKeys(new Date('2026-11-16T01:00:00Z'));
    const newer = auditKeys(new Date('2026-11-16T02:00:00Z'));
    assert.ok(newer.rowKey < older.rowKey);
  });
  it('keeps row keys unique for the same millisecond', () => {
    const now = new Date('2026-11-16T01:00:00Z');
    assert.notEqual(auditKeys(now).rowKey, auditKeys(now).rowKey);
  });
});

describe('AuditLog.append', () => {
  const makeTable = () => ({ createEntity: mock.fn(async () => {}) });

  it('inserts one entity with defaults and a numeric km', async () => {
    const table = makeTable();
    const entity = await createAuditLog(table).append({ action: 'UPLOAD', actor: 'F001', runId: 'r1', km: '5.2' });
    assert.equal(table.createEntity.mock.callCount(), 1);
    assert.equal(table.createEntity.mock.calls[0].arguments[0], entity);
    assert.equal(entity.action, 'UPLOAD');
    assert.equal(entity.actor, 'F001');
    assert.equal(entity.km, 5.2);
    assert.equal(entity.result, 'OK');
    assert.equal(entity.clientIp, '');
  });
  it('keeps km empty when there is no distance', async () => {
    const entity = await createAuditLog(makeTable()).append({ action: 'LOGIN', actor: 'F001' });
    assert.equal(entity.km, '');
  });
  it('truncates detail to 500 characters', async () => {
    const entity = await createAuditLog(makeTable()).append({ action: 'X', actor: 'a', detail: 'd'.repeat(900) });
    assert.equal(entity.detail.length, 500);
  });
  it('only ever inserts (the table fake has no update or delete)', async () => {
    const audit = createAuditLog(makeTable());
    assert.deepEqual(Object.keys(audit).sort(), ['append', 'listByDate']);
  });
});

describe('AuditLog.listByDate', () => {
  const tableWith = (rows) => ({
    listEntities: mock.fn(function () {
      return (async function* () { yield* rows; })();
    }),
  });

  it('filters by the date partition', async () => {
    const table = tableWith([{ rowKey: 'a' }]);
    await createAuditLog(table).listByDate('2026-11-16');
    assert.match(table.listEntities.mock.calls[0].arguments[0].queryOptions.filter, /PartitionKey eq '2026-11-16'/);
  });
  it('stops at the limit', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({ rowKey: String(i) }));
    const out = await createAuditLog(tableWith(rows)).listByDate('2026-11-16', 3);
    assert.equal(out.length, 3);
  });
});
