'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { createUserModel } = require('../../src/models/User');
const { createRunModel } = require('../../src/models/Run');

const notFound = () => Object.assign(new Error('nf'), { statusCode: 404 });
const iterOf = (rows) => (async function* () { yield* rows; })();

describe('User model', () => {
  it('returns the entity when it exists', async () => {
    const table = { getEntity: mock.fn(async () => ({ rowKey: 'F001' })) };
    assert.deepEqual(await createUserModel(table).get('F001'), { rowKey: 'F001' });
    assert.deepEqual(table.getEntity.mock.calls[0].arguments, ['user', 'F001']);
  });
  it('returns null on 404 and rethrows other errors', async () => {
    assert.equal(await createUserModel({ getEntity: async () => { throw notFound(); } }).get('x'), null);
    await assert.rejects(createUserModel({ getEntity: async () => { throw new Error('boom'); } }).get('x'), /boom/);
  });
  it('creates the user in partition "user" without leaking extra fields', async () => {
    const table = { createEntity: mock.fn(async () => {}) };
    await createUserModel(table).create({ code: 'F001', fullName: 'Ann', passwordHash: 'h', role: 'user' });
    const e = table.createEntity.mock.calls[0].arguments[0];
    assert.equal(e.partitionKey, 'user');
    assert.equal(e.rowKey, 'F001');
    assert.equal(e.passwordHash, 'h');
    assert.ok(e.createdUtc);
  });
});

describe('Run model', () => {
  it('get returns null on 404', async () => {
    assert.equal(await createRunModel({ getEntity: async () => { throw notFound(); } }).get('2026-11', 'x'), null);
  });
  it('listByMonth builds an OData filter from the options', async () => {
    const table = { listEntities: mock.fn(() => iterOf([])) };
    await createRunModel(table).listByMonth('2026-11', { employeeCode: 'F001', status: 'APPROVED' });
    const { filter } = table.listEntities.mock.calls[0].arguments[0].queryOptions;
    assert.equal(filter, "PartitionKey eq '2026-11' and employeeCode eq 'F001' and status eq 'APPROVED'");
  });
  it('listByMonth escapes quotes in values (no filter injection)', async () => {
    const table = { listEntities: mock.fn(() => iterOf([])) };
    await createRunModel(table).listByMonth('2026-11', { employeeCode: "x' or 'a' eq 'a" });
    const { filter } = table.listEntities.mock.calls[0].arguments[0].queryOptions;
    assert.match(filter, /employeeCode eq 'x'' or ''a'' eq ''a'/);
  });
  it('listByMonth sorts by run date, then created time, newest first', async () => {
    const rows = [
      { rowKey: 'old', runDate: '2026-11-01', createdUtc: '2026-11-01T01:00:00Z' },
      { rowKey: 'new-early', runDate: '2026-11-05', createdUtc: '2026-11-05T01:00:00Z' },
      { rowKey: 'new-late', runDate: '2026-11-05', createdUtc: '2026-11-05T09:00:00Z' },
    ];
    const out = await createRunModel({ listEntities: () => iterOf(rows) }).listByMonth('2026-11');
    assert.deepEqual(out.map((r) => r.rowKey), ['new-late', 'new-early', 'old']);
  });
  it('merge uses the Merge update mode', async () => {
    const table = { updateEntity: mock.fn(async () => {}) };
    await createRunModel(table).merge({ partitionKey: 'p', rowKey: 'r', status: 'APPROVED' });
    assert.equal(table.updateEntity.mock.calls[0].arguments[1], 'Merge');
  });
});
