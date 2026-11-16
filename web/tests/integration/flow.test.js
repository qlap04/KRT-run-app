'use strict';
// Integration test (CI): needs a storage emulator and STORAGE_CONNECTION_STRING.
// Run: STORAGE_CONNECTION_STRING=... npm run test:integration
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const CONN = process.env.STORAGE_CONNECTION_STRING;
const SKIP = CONN ? false : 'Skipping integration test: STORAGE_CONNECTION_STRING is not set (needs a storage emulator).';

describe('upload -> process -> approve -> leaderboard', { skip: SKIP }, () => {
  const rand = crypto.randomBytes(3).toString('hex'); // unique names per run so runs never share data
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF-fake-image-data')]);
  let cfg, storage, agent, audit, runs, processMessage;
  const state = {};

  const csrfFrom = async (path) => {
    const res = await agent.get(path).expect(200);
    const m = /name="_csrf" value="([^"]+)"/.exec(res.text);
    assert.ok(m, 'no csrf token found at ' + path);
    return m[1];
  };
  const listBlobs = async (container) => {
    const out = [];
    for await (const b of container.listBlobsFlat()) out.push(b.name);
    return out;
  };

  before(async () => {
    const { loadConfig } = require('../../src/config');
    const { createStorage } = require('../../src/services/storageService');
    const { createUserModel } = require('../../src/models/User');
    const { createRunModel } = require('../../src/models/Run');
    const { createAuditLog } = require('../../src/models/AuditLog');
    const { createAuthService } = require('../../src/services/authService');
    const { createRunService } = require('../../src/services/runService');
    const { createAuditService } = require('../../src/services/auditService');
    const { createApp } = require('../../src/app');
    ({ processMessage } = require('../../../function/src/lib/processor'));

    cfg = loadConfig({
      APP_ENV: 'dev',
      STORAGE_CONNECTION_STRING: CONN,
      SESSION_SECRET: 'integration-test-secret',
      ADMIN_CODE: 'ADMIN01',
      BLOB_CONTAINER_INCOMING: `it-in-${rand}`,
      BLOB_CONTAINER_PROOFS: `it-proofs-${rand}`,
      QUEUE_NAME: `it-queue-${rand}`,
      TABLE_USERS: `ItUsers${rand}`,
      TABLE_RUNS: `ItRuns${rand}`,
      TABLE_AUDIT: `ItAudit${rand}`,
    });
    storage = createStorage(cfg);
    await storage.ensure();
    const users = createUserModel(storage.users);
    runs = createRunModel(storage.runs);
    audit = createAuditLog(storage.audit);
    const authService = createAuthService({ cfg, users, audit });
    const runService = createRunService({ cfg, storage, runs, audit });
    const auditService = createAuditService({ audit });
    const app = createApp({ cfg, authService, runService, auditService });
    agent = request.agent(app);
  });

  after(async () => {
    if (!storage) return;
    await Promise.allSettled([
      storage.incoming.deleteIfExists(), storage.proofs.deleteIfExists(), storage.queue.deleteIfExists(),
      storage.users.deleteTable(), storage.runs.deleteTable(), storage.audit.deleteTable(),
    ]);
  });

  it('GET /api/health is public', async () => {
    const r = await agent.get('/api/health').expect(200);
    assert.equal(r.body.status, 'ok');
  });

  it('register (admin code) -> login', async () => {
    let t = await csrfFrom('/register');
    await agent.post('/register').type('form')
      .send({ _csrf: t, employeeCode: 'ADMIN01', fullName: 'Admin IT', password: 'Password1', password2: 'Password1' })
      .expect(302).expect('Location', '/login');
    t = await csrfFrom('/login');
    await agent.post('/login').type('form')
      .send({ _csrf: t, employeeCode: 'ADMIN01', password: 'Password1' })
      .expect(302).expect('Location', '/runs');
    const user = await storage.users.getEntity('user', 'ADMIN01');
    assert.equal(user.role, 'admin');
    assert.notEqual(user.passwordHash, 'Password1');
  });

  it('upload: blob in incoming, queue message, Runs PENDING_PROCESSING', async () => {
    const today = new Date(Date.now() + 7 * 3600e3).toISOString().slice(0, 10);
    state.month = today.slice(0, 7);
    const t = await csrfFrom('/upload');
    await agent.post('/upload')
      .field('_csrf', t).field('runDate', today).field('km', '5,2')
      .attach('proof', JPG, { filename: 'run.jpg', contentType: 'image/jpeg' })
      .expect(302).expect('Location', '/upload?ok=1');

    const blobs = await listBlobs(storage.incoming);
    assert.equal(blobs.length, 1);

    const peek = await storage.queue.peekMessages({ numberOfMessages: 5 });
    assert.equal(peek.peekedMessageItems.length, 1);
    state.msg = JSON.parse(Buffer.from(peek.peekedMessageItems[0].messageText, 'base64').toString('utf8'));
    assert.equal(state.msg.employeeCode, 'ADMIN01');
    assert.equal(state.msg.blobName, blobs[0]);
    assert.equal(state.msg.km, 5.2);

    const run = await runs.get(state.month, state.msg.runId);
    assert.equal(run.status, 'PENDING_PROCESSING');
    assert.equal(Number(run.km), 5.2);
  });

  it('invalid upload is rejected and nothing is stored', async () => {
    const t = await csrfFrom('/upload');
    const today = new Date().toISOString().slice(0, 10);
    await agent.post('/upload')
      .field('_csrf', t).field('runDate', today).field('km', '3')
      .attach('proof', Buffer.from('this is not an image'), { filename: 'x.jpg', contentType: 'image/jpeg' })
      .expect(400);
    assert.equal((await listBlobs(storage.incoming)).length, 1);
  });

  it('function processMessage: blob in proofs, Runs PENDING_REVIEW, AuditLog UPLOAD + PROCESSED', async () => {
    const result = await processMessage(state.msg, { storage });
    assert.equal(result.status, 'PENDING_REVIEW');

    assert.deepEqual(await listBlobs(storage.incoming), []);
    const proofs = await listBlobs(storage.proofs);
    assert.deepEqual(proofs, [`${state.month}/ADMIN01/${state.msg.runId}.jpg`]);

    const run = await runs.get(state.month, state.msg.runId);
    assert.equal(run.status, 'PENDING_REVIEW');
    assert.equal(run.blobContainer, cfg.names.proofsContainer);

    const day = new Date().toISOString().slice(0, 10);
    const actions = (await audit.listByDate(day)).filter((e) => e.runId === state.msg.runId).map((e) => e.action);
    assert.ok(actions.includes('UPLOAD'), 'missing AuditLog UPLOAD');
    assert.ok(actions.includes('PROCESSED'), 'missing AuditLog PROCESSED');
  });

  it('proof image is streamed to the owner', async () => {
    const res = await agent.get(`/proof/${state.month}/${state.msg.runId}`).buffer(true).parse((r, cb) => {
      const chunks = []; r.on('data', (c) => chunks.push(c)); r.on('end', () => cb(null, Buffer.concat(chunks)));
    }).expect(200);
    assert.equal(res.headers['content-type'], 'image/jpeg');
    assert.deepEqual(res.body, JPG);
  });

  it('admin approves -> leaderboard shows approved km', async () => {
    let t = await csrfFrom('/admin');
    await agent.post(`/admin/runs/${state.month}/${state.msg.runId}/approve`).type('form').send({ _csrf: t })
      .expect(302);
    assert.equal((await runs.get(state.month, state.msg.runId)).status, 'APPROVED');

    const lb = await agent.get(`/api/leaderboard?month=${state.month}`).expect(200);
    assert.deepEqual(lb.body.rows, [{ employeeCode: 'ADMIN01', km: 5.2, runs: 1 }]);

    const day = new Date().toISOString().slice(0, 10);
    const actions = (await audit.listByDate(day)).map((e) => e.action);
    assert.ok(actions.includes('APPROVED'));
    // processing the same message again does nothing (idempotent)
    assert.equal((await processMessage(state.msg, { storage })).status, 'already-processed');
  });
});
