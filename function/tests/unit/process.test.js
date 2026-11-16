'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const { processMessage } = require('../../src/lib/processor');

const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(100, 1)]);
const ids = { runId: '11111111-1111-1111-1111-111111111111' };
const msg = { runId: ids.runId, month: '2026-11', employeeCode: 'F001', blobName: ids.runId + '.jpg' };

function fakeStorage(blob, status = 'PENDING_PROCESSING') {
  const s = { uploaded: {}, deleted: [], updates: [], audits: [] };
  s.incoming = { getBlobClient: () => ({
    download: async () => { if (!blob) { const e = new Error('nf'); e.statusCode = 404; throw e; } return { readableStreamBody: Readable.from([blob]) }; },
    deleteIfExists: async () => s.deleted.push('x'),
  }) };
  s.proofs = { containerName: 'proofs', getBlockBlobClient: (p) => ({ uploadData: async (b) => { s.uploaded[p] = b.length; } }) };
  s.runs = { getEntity: async () => ({ status, km: 5, runDate: '2026-11-10' }), updateEntity: async (e) => s.updates.push(e) };
  s.audit = { createEntity: async (e) => s.audits.push(e) };
  return s;
}

test('valid image -> proofs + PENDING_REVIEW + audit', async () => {
  const s = fakeStorage(JPG);
  const r = await processMessage(msg, { storage: s });
  assert.equal(r.status, 'PENDING_REVIEW');
  assert.ok(s.uploaded['2026-11/F001/' + ids.runId + '.jpg']);
  assert.equal(s.updates[0].status, 'PENDING_REVIEW');
  assert.equal(s.audits[0].action, 'PROCESSED');
  assert.equal(s.deleted.length, 1);
});
test('invalid image -> REJECTED_INVALID', async () => {
  const s = fakeStorage(Buffer.from('not an image at all'));
  const r = await processMessage(msg, { storage: s });
  assert.equal(r.status, 'REJECTED_INVALID');
  assert.equal(s.audits[0].result, 'REJECTED_INVALID');
  assert.equal(Object.keys(s.uploaded).length, 0);
});
test('missing blob -> REJECTED_INVALID', async () => {
  const r = await processMessage(msg, { storage: fakeStorage(null) });
  assert.equal(r.status, 'REJECTED_INVALID');
});
test('already processed is skipped (idempotent)', async () => {
  const s = fakeStorage(JPG, 'APPROVED');
  assert.equal((await processMessage(msg, { storage: s })).status, 'already-processed');
  assert.equal(s.updates.length, 0);
});
