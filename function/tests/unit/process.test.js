'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { processMessage } = require('../../src/lib/processor');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(100, 1)]);
const RUN_ID = '11111111-1111-1111-1111-111111111111';
const msg = { runId: RUN_ID, month: '2026-11', employeeCode: 'F001', blobName: `${RUN_ID}.jpg` };
const statusError = (statusCode) => Object.assign(new Error(`status ${statusCode}`), { statusCode });

// Builds fake storage clients. `blob`: Buffer to serve, null for "not found", or an Error to throw.
function setup({ blob = JPG, runStatus = 'PENDING_PROCESSING', getRun } = {}) {
  const upload = mock.fn(async () => {});
  const deleteSource = mock.fn(async () => true);
  const download = mock.fn(async () => {
    if (blob === null) throw statusError(404);
    if (blob instanceof Error) throw blob;
    return { readableStreamBody: Readable.from([blob]) };
  });
  const storage = {
    blobs: {
      containerName: 'proofs',
      getBlobClient: mock.fn(() => ({ download, deleteIfExists: deleteSource })),
      getBlockBlobClient: mock.fn(() => ({ uploadData: upload })),
    },
    runs: {
      getEntity: mock.fn(getRun || (async () => ({ status: runStatus, km: 5, runDate: '2026-11-10' }))),
      updateEntity: mock.fn(async () => {}),
    },
    audit: { createEntity: mock.fn(async () => {}) },
  };
  return { storage, upload, deleteSource };
}
const audited = (storage) => storage.audit.createEntity.mock.calls.map((c) => c.arguments[0]);
const updated = (storage) => storage.runs.updateEntity.mock.calls.map((c) => c.arguments);

describe('processMessage: valid image', () => {
  it('moves the blob from incoming/ to processed/ and marks the run PENDING_REVIEW', async () => {
    const { storage, upload, deleteSource } = setup();
    const result = await processMessage(msg, { storage });

    assert.deepEqual(result, { status: 'PENDING_REVIEW' });
    assert.equal(storage.blobs.getBlobClient.mock.calls[0].arguments[0], `incoming/${RUN_ID}.jpg`);
    assert.equal(storage.blobs.getBlockBlobClient.mock.calls[0].arguments[0], `processed/2026-11/F001/${RUN_ID}.jpg`);
    assert.equal(upload.mock.calls[0].arguments[0].length, JPG.length);
    assert.equal(upload.mock.calls[0].arguments[1].blobHTTPHeaders.blobContentType, 'image/jpeg');
    assert.equal(deleteSource.mock.callCount(), 1);

    const [[entity, mode]] = updated(storage);
    assert.equal(mode, 'Merge');
    assert.equal(entity.partitionKey, '2026-11');
    assert.equal(entity.rowKey, RUN_ID);
    assert.equal(entity.status, 'PENDING_REVIEW');
    assert.equal(entity.blobContainer, 'proofs');
    assert.equal(entity.blobPath, `processed/2026-11/F001/${RUN_ID}.jpg`);
  });
  it('writes one PROCESSED audit record with result OK', async () => {
    const { storage } = setup();
    await processMessage(msg, { storage });
    const records = audited(storage);
    assert.equal(records.length, 1);
    assert.equal(records[0].action, 'PROCESSED');
    assert.equal(records[0].actor, 'function');
    assert.equal(records[0].result, 'OK');
    assert.equal(records[0].runId, RUN_ID);
  });
  it('uses the detected type for the extension (png content gives .png)', async () => {
    const { storage } = setup({ blob: PNG });
    await processMessage({ ...msg, blobName: `${RUN_ID}.png` }, { storage });
    assert.equal(storage.blobs.getBlockBlobClient.mock.calls[0].arguments[0], `processed/2026-11/F001/${RUN_ID}.png`);
  });
});

describe('processMessage: invalid image', () => {
  it('rejects non-image content, deletes the source and does not copy it', async () => {
    const { storage, upload, deleteSource } = setup({ blob: Buffer.from('not an image at all') });
    const result = await processMessage(msg, { storage });
    assert.deepEqual(result, { status: 'REJECTED_INVALID' });
    assert.equal(upload.mock.callCount(), 0);
    assert.equal(deleteSource.mock.callCount(), 1);
    assert.equal(updated(storage)[0][0].status, 'REJECTED_INVALID');
    assert.equal(updated(storage)[0][0].rejectReason, 'Not a JPG/PNG image');
    assert.equal(audited(storage)[0].result, 'REJECTED_INVALID');
  });
  it('rejects a missing blob (404) as invalid', async () => {
    const { storage, upload } = setup({ blob: null });
    assert.deepEqual(await processMessage(msg, { storage }), { status: 'REJECTED_INVALID' });
    assert.equal(updated(storage)[0][0].rejectReason, 'Image not found');
    assert.equal(upload.mock.callCount(), 0);
  });
  it('lets transient download errors bubble up so the queue retries', async () => {
    const { storage } = setup({ blob: statusError(503) });
    await assert.rejects(processMessage(msg, { storage }), /status 503/);
    assert.equal(updated(storage).length, 0);
    assert.equal(audited(storage).length, 0);
  });
});

describe('processMessage: invalid queue message', () => {
  for (const [name, bad] of [
    ['null', null],
    ['a path traversal blob name', { ...msg, blobName: '../../etc/passwd' }],
    ['a bad run id', { ...msg, runId: 'x' }],
  ]) {
    it(`ignores ${name}, audits it and touches no data`, async () => {
      const logs = [];
      const { storage, upload } = setup();
      const result = await processMessage(bad, { storage, log: (m) => logs.push(m) });
      assert.deepEqual(result, { status: 'ignored' });
      assert.equal(storage.runs.getEntity.mock.callCount(), 0);
      assert.equal(upload.mock.callCount(), 0);
      assert.equal(updated(storage).length, 0);
      assert.equal(audited(storage)[0].result, 'REJECTED_INVALID');
      assert.match(audited(storage)[0].detail, /^bad message: /);
      assert.match(logs[0], /Ignoring invalid message/);
    });
  }
});

describe('processMessage: run state', () => {
  it('ignores a message whose run does not exist (404)', async () => {
    const { storage } = setup({ getRun: async () => { throw statusError(404); } });
    assert.deepEqual(await processMessage(msg, { storage }), { status: 'ignored' });
    assert.equal(updated(storage).length, 0);
  });
  it('rethrows other errors when reading the run', async () => {
    const { storage } = setup({ getRun: async () => { throw statusError(500); } });
    await assert.rejects(processMessage(msg, { storage }), /status 500/);
  });
  for (const status of ['PENDING_REVIEW', 'APPROVED', 'REJECTED', 'REJECTED_INVALID']) {
    it(`is idempotent: a run in ${status} is not processed again`, async () => {
      const { storage, upload } = setup({ runStatus: status });
      assert.deepEqual(await processMessage(msg, { storage }), { status: 'already-processed' });
      assert.equal(upload.mock.callCount(), 0);
      assert.equal(updated(storage).length, 0);
      assert.equal(audited(storage).length, 0);
    });
  }
});
