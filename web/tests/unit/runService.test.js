'use strict';
const { describe, it, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { createRunService, leaderboard, STATUS } = require('../../src/services/runService');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('fake-jpeg')]);
const RUN_ID = '11111111-1111-1111-1111-111111111111';
const user = { code: 'F001', fullName: 'Ann', role: 'user' };
const admin = { code: 'ADM01', fullName: 'Root', role: 'admin' };
const cfg = { names: { blobContainer: 'proofs' } };

function setup({ runRows = [], run = null } = {}) {
  const blockBlob = { uploadData: mock.fn(async () => {}) };
  const download = mock.fn(async () => ({ readableStreamBody: Readable.from([JPG]) }));
  const storage = {
    blobs: { getBlockBlobClient: mock.fn(() => blockBlob) },
    queue: { sendMessage: mock.fn(async () => {}) },
    container: mock.fn(() => ({ getBlobClient: () => ({ download }) })),
  };
  const runs = {
    create: mock.fn(async () => {}),
    get: mock.fn(async () => run),
    listByMonth: mock.fn(async () => runRows),
    merge: mock.fn(async () => {}),
  };
  const audit = { append: mock.fn(async () => {}) };
  return { blockBlob, storage, runs, audit, service: createRunService({ cfg, storage, runs, audit }) };
}

describe('leaderboard', () => {
  it('counts only APPROVED runs, sums km and sorts by km desc', () => {
    const rows = leaderboard([
      { employeeCode: 'A', km: '5', status: STATUS.APPROVED },
      { employeeCode: 'A', km: '2.25', status: STATUS.APPROVED },
      { employeeCode: 'B', km: '10', status: STATUS.APPROVED },
      { employeeCode: 'B', km: '50', status: STATUS.PENDING_REVIEW },
      { employeeCode: 'C', km: '9', status: STATUS.REJECTED },
    ]);
    assert.deepEqual(rows.map((r) => [r.employeeCode, r.km, r.runs]), [['B', 10, 1], ['A', 7.25, 2]]);
  });
  it('avoids floating point drift', () => {
    const rows = leaderboard([0.1, 0.2].map((km) => ({ employeeCode: 'A', km, status: STATUS.APPROVED })));
    assert.equal(rows[0].km, 0.3);
  });
  it('returns an empty list when nothing is approved', () => {
    assert.deepEqual(leaderboard([]), []);
  });
});

describe('runService.upload', () => {
  beforeEach(() => {
    // 2026-11-16 12:00 in Vietnam
    mock.timers.enable({ apis: ['Date'], now: Date.UTC(2026, 10, 16, 5, 0) });
  });
  afterEach(() => mock.timers.reset());

  const file = { buffer: JPG, originalname: 'run.jpg' };
  const input = { user, km: '5,2', runDate: '2026-11-16', file, clientIp: '1.2.3.4' };

  it('stores the blob, the run, the queue message and the audit record', async () => {
    const { service, blockBlob, storage, runs, audit } = setup();
    assert.deepEqual(await service.upload(input), { ok: true });

    const blobPath = storage.blobs.getBlockBlobClient.mock.calls[0].arguments[0];
    assert.match(blobPath, /^incoming\/[0-9a-f-]{36}\.jpg$/);
    const blobName = blobPath.slice('incoming/'.length);
    assert.equal(blockBlob.uploadData.mock.calls[0].arguments[0], JPG);

    const run = runs.create.mock.calls[0].arguments[0];
    assert.equal(run.partitionKey, '2026-11');
    assert.equal(run.status, STATUS.PENDING_PROCESSING);
    assert.equal(run.km, 5.2);
    assert.equal(run.employeeCode, 'F001');
    assert.equal(run.blobContainer, 'proofs');
    assert.equal(run.blobPath, blobPath);

    const sent = storage.queue.sendMessage.mock.calls[0].arguments[0];
    const msg = JSON.parse(Buffer.from(sent, 'base64').toString('utf8'));
    assert.deepEqual(msg, { runId: run.rowKey, month: '2026-11', employeeCode: 'F001', blobName, km: 5.2, runDate: '2026-11-16' });

    const entry = audit.append.mock.calls[0].arguments[0];
    assert.equal(entry.action, 'UPLOAD');
    assert.equal(entry.runId, run.rowKey);
  });

  for (const [name, patch, message] of [
    ['an out-of-range distance', { km: '500' }, /between 0.1 and 100/],
    ['a future date', { runDate: '2026-11-17' }, /future/],
    ['a missing file', { file: undefined }, /No image selected/],
    ['a non-image file', { file: { buffer: Buffer.from('not an image at all') } }, /JPG or PNG/],
  ]) {
    it(`rejects ${name} and stores nothing`, async () => {
      const { service, blockBlob, runs, storage, audit } = setup();
      const r = await service.upload({ ...input, ...patch });
      assert.equal(r.ok, false);
      assert.match(r.error, message);
      assert.equal(blockBlob.uploadData.mock.callCount(), 0);
      assert.equal(runs.create.mock.callCount(), 0);
      assert.equal(storage.queue.sendMessage.mock.callCount(), 0);
      assert.equal(audit.append.mock.callCount(), 0);
    });
  }
});

describe('runService.review', () => {
  const pending = { status: STATUS.PENDING_REVIEW, km: 5, runDate: '2026-11-10', employeeCode: 'F001' };
  const review = (service, over = {}) => service.review({
    month: '2026-11', runId: RUN_ID, newStatus: STATUS.APPROVED, note: 'ok', actor: 'ADM01', clientIp: '1.2.3.4', ...over,
  });

  it('approves a pending run and audits APPROVED', async () => {
    const { service, runs, audit } = setup({ run: pending });
    assert.deepEqual(await review(service), { ok: true, month: '2026-11' });
    const merged = runs.merge.mock.calls[0].arguments[0];
    assert.equal(merged.status, STATUS.APPROVED);
    assert.equal(merged.reviewedBy, 'ADM01');
    assert.equal(audit.append.mock.calls[0].arguments[0].action, 'APPROVED');
  });
  it('rejects a pending run and audits REJECTED', async () => {
    const { service, audit } = setup({ run: pending });
    await review(service, { newStatus: STATUS.REJECTED });
    assert.equal(audit.append.mock.calls[0].arguments[0].action, 'REJECTED');
  });
  it('truncates the review note to 200 characters', async () => {
    const { service, runs } = setup({ run: pending });
    await review(service, { note: 'n'.repeat(500) });
    assert.equal(runs.merge.mock.calls[0].arguments[0].reviewNote.length, 200);
  });
  it('returns notFound for an invalid month or a missing run', async () => {
    assert.deepEqual(await review(setup({ run: pending }).service, { month: 'bad' }), { notFound: true });
    assert.deepEqual(await review(setup({ run: null }).service), { notFound: true });
  });
  it('returns a conflict when the run is not waiting for review', async () => {
    const { service, runs, audit } = setup({ run: { ...pending, status: STATUS.APPROVED } });
    const r = await review(service);
    assert.equal(r.conflict, true);
    assert.match(r.message, /APPROVED/);
    assert.equal(runs.merge.mock.callCount(), 0);
    assert.equal(audit.append.mock.callCount(), 0);
  });
});

describe('runService.openProof', () => {
  const run = { employeeCode: 'F001', blobPath: 'processed/2026-11/F001/x.jpg', blobContainer: 'proofs', contentType: 'image/jpeg' };

  it('lets the owner open the proof', async () => {
    const { service, storage } = setup({ run });
    const r = await service.openProof({ month: '2026-11', runId: RUN_ID, user });
    assert.equal(r.contentType, 'image/jpeg');
    assert.ok(r.stream);
    assert.equal(storage.container.mock.calls[0].arguments[0], 'proofs');
  });
  it('lets an admin open anyone\'s proof', async () => {
    const r = await setup({ run }).service.openProof({ month: '2026-11', runId: RUN_ID, user: admin });
    assert.ok(r.stream);
  });
  it('hides the proof from other users (404, not 403)', async () => {
    const r = await setup({ run }).service.openProof({ month: '2026-11', runId: RUN_ID, user: { code: 'F999', role: 'user' } });
    assert.deepEqual(r, { notFound: true });
  });
  it('returns notFound for bad ids, missing runs and runs without a blob', async () => {
    assert.deepEqual(await setup({ run }).service.openProof({ month: 'bad', runId: RUN_ID, user }), { notFound: true });
    assert.deepEqual(await setup({ run }).service.openProof({ month: '2026-11', runId: '../x', user }), { notFound: true });
    assert.deepEqual(await setup({ run: null }).service.openProof({ month: '2026-11', runId: RUN_ID, user }), { notFound: true });
    assert.deepEqual(await setup({ run: { ...run, blobPath: '' } }).service.openProof({ month: '2026-11', runId: RUN_ID, user }), { notFound: true });
  });
});

describe('runService: queries', () => {
  const rows = [
    { rowKey: 'r1', partitionKey: '2026-11', employeeCode: 'A', km: '5', status: STATUS.APPROVED, runDate: '2026-11-02' },
    { rowKey: 'r2', partitionKey: '2026-11', employeeCode: 'A', km: '3', status: STATUS.PENDING_REVIEW, runDate: '2026-11-03' },
    { rowKey: 'r3', partitionKey: '2026-11', employeeCode: 'A', km: '2', status: STATUS.PENDING_PROCESSING, runDate: '2026-11-04' },
  ];

  it('myRuns sums approved and pending km', async () => {
    const { service, runs } = setup({ runRows: rows });
    const r = await service.myRuns('2026-11', 'A');
    assert.equal(r.approvedKm, 5);
    assert.equal(r.pendingKm, 5);
    assert.deepEqual(runs.listByMonth.mock.calls[0].arguments, ['2026-11', { employeeCode: 'A' }]);
  });
  it('falls back to the current month for an invalid month', async () => {
    const { service } = setup();
    assert.match(service.monthOrCurrent('nope'), /^\d{4}-\d{2}$/);
    assert.equal(service.monthOrCurrent('2026-05'), '2026-05');
  });
  it('apiRuns limits a normal user to their own runs', async () => {
    const { service, runs } = setup({ runRows: rows });
    await service.apiRuns({ monthQuery: '2026-11', apiAll: false, sessionUser: user });
    assert.deepEqual(runs.listByMonth.mock.calls[0].arguments[1], { employeeCode: 'F001' });
  });
  it('apiRuns returns every run for an admin or an API key', async () => {
    const a = setup({ runRows: rows });
    await a.service.apiRuns({ monthQuery: '2026-11', apiAll: false, sessionUser: admin });
    assert.deepEqual(a.runs.listByMonth.mock.calls[0].arguments[1], {});
    const b = setup({ runRows: rows });
    await b.service.apiRuns({ monthQuery: '2026-11', apiAll: true, sessionUser: undefined });
    assert.deepEqual(b.runs.listByMonth.mock.calls[0].arguments[1], {});
  });
  it('apiRuns exposes only the public fields', async () => {
    const { service } = setup({ runRows: [{ ...rows[0], passwordHash: 'leak', fullName: 'Ann' }] });
    const r = await service.apiRuns({ monthQuery: '2026-11', apiAll: true });
    assert.deepEqual(Object.keys(r.runs[0]).sort(), ['createdUtc', 'employeeCode', 'km', 'month', 'runDate', 'runId', 'status']);
  });
  it('apiLeaderboard returns only employeeCode, km and runs', async () => {
    const { service } = setup({ runRows: rows });
    const r = await service.apiLeaderboard('2026-11');
    assert.deepEqual(r.rows, [{ employeeCode: 'A', km: 5, runs: 1 }]);
  });
  it('pendingReview asks only for PENDING_REVIEW runs', async () => {
    const { service, runs } = setup({ runRows: rows });
    await service.pendingReview('2026-11');
    assert.deepEqual(runs.listByMonth.mock.calls[0].arguments, ['2026-11', { status: STATUS.PENDING_REVIEW }]);
  });
});
