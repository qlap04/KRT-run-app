'use strict';
// Integration tests: real Express API + real Blob/Queue/Table clients against a storage emulator (Azurite).
//
// Configuration comes ONLY from environment variables:
//   STORAGE_CONNECTION_STRING   required, e.g. UseDevelopmentStorage=true with Azurite running
//   INTEGRATION_REQUIRED=true   optional, fail instead of skip when the connection string is missing (use in CI)
//
// Every run creates its own containers, queue and tables (random suffix) and deletes them in after(),
// so runs never share data. Each test registers its own users, so tests do not depend on each other.
// Auth is JWT Bearer for every authenticated step. The only ordered scenario is the end-to-end flow test.
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const request = require('supertest');

const CONN = process.env.STORAGE_CONNECTION_STRING;
const REQUIRED = process.env.INTEGRATION_REQUIRED === 'true';
const SKIP = CONN
  ? false
  : 'Skipping integration tests: STORAGE_CONNECTION_STRING is not set (start Azurite and set it to run them).';

if (!CONN && REQUIRED) {
  throw new Error('INTEGRATION_REQUIRED=true but STORAGE_CONNECTION_STRING is not set');
}

const rand = () => crypto.randomBytes(4).toString('hex');
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]), Buffer.from('JFIF-fake-image-data')]);
// Test credentials are generated at runtime; nothing secret is stored in the repository.
const newPassword = () => `Pw-${crypto.randomBytes(8).toString('hex')}`;

describe('web + storage integration', { skip: SKIP }, () => {
  const suffix = rand();
  const adminCode = `ADM${suffix}`;
  const apiKey = crypto.randomBytes(16).toString('hex');
  const adminPassword = newPassword();
  let cfg, storage, app, runs, audit, processMessage, todayVN, adminToken;

  const register = (code, password, fullName = 'Test User') => (
    request(app).post('/api/auth/register')
      .send({ employeeCode: code, fullName, password, password2: password })
  );
  const login = (code, password) => (
    request(app).post('/api/auth/login').send({ employeeCode: code, password })
  );
  const bearer = (token) => ({ Authorization: `Bearer ${token}` });
  // Registers a brand-new user and returns its JWT.
  const newUser = async (prefix = 'U') => {
    const code = `${prefix}${rand()}`;
    const password = newPassword();
    await register(code, password).expect(200);
    const { body } = await login(code, password).expect(200);
    assert.ok(body.token);
    return { code, password, token: body.token };
  };
  const upload = (token, { km = '5,2', runDate = todayVN(), file = JPG, filename = 'run.jpg' } = {}) => (
    request(app).post('/api/runs')
      .set(bearer(token))
      .field('runDate', runDate)
      .field('km', km)
      .attach('proof', file, { filename, contentType: 'image/jpeg' })
  );
  const listBlobs = async (container, prefix = '') => {
    const names = [];
    for await (const b of container.listBlobsFlat({ prefix })) names.push(b.name);
    return names;
  };
  const listAll = async (table) => {
    const rows = [];
    for await (const e of table.listEntities()) rows.push(e);
    return rows;
  };
  const queueMessagesFor = async (employeeCode) => {
    const peek = await storage.queue.peekMessages({ numberOfMessages: 32 });
    return peek.peekedMessageItems
      .map((m) => JSON.parse(Buffer.from(m.messageText, 'base64').toString('utf8')))
      .filter((m) => m.employeeCode === employeeCode);
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
    ({ todayVN } = require('../../src/services/validation'));
    ({ processMessage } = require('../../../function/src/lib/processor'));

    // Test-specific config: unique resource names, runtime-generated secrets.
    cfg = loadConfig({
      APP_ENV: 'dev',
      STORAGE_CONNECTION_STRING: CONN,
      SESSION_SECRET: crypto.randomBytes(32).toString('hex'),
      ADMIN_CODE: adminCode,
      API_KEY: apiKey,
      BLOB_CONTAINER: `it-proofs-${suffix}`,
      QUEUE_NAME: `it-queue-${suffix}`,
      TABLE_USERS: `ItUsers${suffix}`,
      TABLE_RUNS: `ItRuns${suffix}`,
      TABLE_AUDIT: `ItAudit${suffix}`,
    });
    storage = createStorage(cfg);
    await storage.ensure();
    const users = createUserModel(storage.users);
    runs = createRunModel(storage.runs);
    audit = createAuditLog(storage.audit);
    const authService = createAuthService({ cfg, users, audit });
    const runService = createRunService({ cfg, storage, runs, audit });
    const auditService = createAuditService({ audit });
    app = createApp({ cfg, authService, runService, auditService });

    // Fixture: one admin for this run (registering ADMIN_CODE gives the admin role).
    await register(adminCode, adminPassword, 'Admin').expect(200);
    ({ body: { token: adminToken } } = await login(adminCode, adminPassword).expect(200));
  });

  after(async () => {
    if (!storage) return;
    await Promise.allSettled([
      storage.blobs.deleteIfExists(), storage.queue.deleteIfExists(),
      storage.users.deleteTable(), storage.runs.deleteTable(), storage.audit.deleteTable(),
    ]);
  });

  describe('public endpoints', () => {
    it('GET /api/health is public', async () => {
      const r = await request(app).get('/api/health').expect(200);
      assert.equal(r.body.status, 'ok');
      assert.equal(r.body.env, 'dev');
    });
    it('unknown paths answer 404 JSON', async () => {
      const r = await request(app).get(`/no-such-page-${suffix}`).expect(404);
      assert.deepEqual(r.body, { error: 'not found' });
    });
  });

  describe('access control', () => {
    it('the API answers 401 without a JWT or API key, and 401 with a wrong key', async () => {
      await request(app).get('/api/runs').expect(401);
      await request(app).get('/api/leaderboard').set('x-api-key', 'wrong').expect(401);
    });
    it('a valid API key can read the API', async () => {
      const r = await request(app).get('/api/leaderboard').set('x-api-key', apiKey).expect(200);
      assert.ok(Array.isArray(r.body.rows));
    });
    it('a normal user cannot call admin APIs (403)', async () => {
      const { token } = await newUser();
      await request(app).get('/api/admin/runs').set(bearer(token)).expect(403);
      await request(app).get('/api/admin/audit').set(bearer(token)).expect(403);
    });
  });

  describe('register and login', () => {
    it('stores a hashed password and the "user" role', async () => {
      const { code, password } = await newUser();
      const user = await storage.users.getEntity('user', code);
      assert.equal(user.role, 'user');
      assert.notEqual(user.passwordHash, password);
      assert.match(user.passwordHash, /^\$2[aby]\$/);
    });
    it('the ADMIN_CODE employee code gets the admin role', async () => {
      const user = await storage.users.getEntity('user', adminCode);
      assert.equal(user.role, 'admin');
    });
    it('rejects a duplicate employee code', async () => {
      const { code } = await newUser();
      const r = await register(code, newPassword());
      assert.equal(r.status, 409);
      assert.match(r.body.error, /already registered/);
    });
    it('rejects a wrong password with 401 and writes a FAILED audit record', async () => {
      const { code } = await newUser();
      const r = await login(code, 'wrong-password');
      assert.equal(r.status, 401);
      assert.equal(r.body.error, 'Wrong employee code or password');
      const failed = (await listAll(storage.audit)).filter((e) => e.actor === code && e.result === 'FAILED');
      assert.equal(failed.length, 1);
    });
    it('GET /api/auth/me returns the JWT user', async () => {
      const { token, code } = await newUser();
      const r = await request(app).get('/api/auth/me').set(bearer(token)).expect(200);
      assert.equal(r.body.code, code);
      assert.equal(r.body.role, 'user');
    });
  });

  describe('upload validation', () => {
    it('rejects a non-image file and stores nothing for that user', async () => {
      const { token, code } = await newUser();
      const before = (await listBlobs(storage.blobs)).length;
      await upload(token, { file: Buffer.from('this is not an image') }).then((r) => assert.equal(r.status, 400));
      assert.equal((await listBlobs(storage.blobs)).length, before);
      assert.deepEqual(await queueMessagesFor(code), []);
      assert.deepEqual((await listAll(storage.runs)).filter((r) => r.employeeCode === code), []);
    });
    it('rejects an invalid distance and a future date', async () => {
      const { token, code } = await newUser();
      await upload(token, { km: '500' }).then((r) => assert.equal(r.status, 400));
      await upload(token, { runDate: '2999-01-01' }).then((r) => assert.equal(r.status, 400));
      assert.deepEqual((await listAll(storage.runs)).filter((r) => r.employeeCode === code), []);
    });
    it('requires a JWT to upload', async () => {
      await request(app).post('/api/runs')
        .field('runDate', todayVN())
        .field('km', '5')
        .attach('proof', JPG, { filename: 'run.jpg', contentType: 'image/jpeg' })
        .expect(401);
    });
  });

  describe('end-to-end flow (ordered steps in one test)', () => {
    it('upload -> function processing -> proof -> admin approval -> leaderboard', async () => {
      const { token, code, password } = await newUser('RUN');

      // 1) upload: blob under incoming/, queue message, run PENDING_PROCESSING
      const day = todayVN();
      const month = day.slice(0, 7);
      await upload(token, { km: '5,2', runDate: day }).expect(201);
      const [msg, ...others] = await queueMessagesFor(code);
      assert.equal(others.length, 0, 'exactly one queue message for this user');
      assert.equal(msg.km, 5.2);
      assert.ok((await listBlobs(storage.blobs, 'incoming/')).includes(`incoming/${msg.blobName}`), 'blob is under incoming/');
      let run = await runs.get(month, msg.runId);
      assert.equal(run.status, 'PENDING_PROCESSING');
      assert.equal(Number(run.km), 5.2);

      // 2) function: blob moves to processed/, run PENDING_REVIEW
      assert.equal((await processMessage(msg, { storage })).status, 'PENDING_REVIEW');
      assert.deepEqual(await listBlobs(storage.blobs, 'incoming/'), [], 'nothing left under incoming/');
      assert.deepEqual(
        (await listBlobs(storage.blobs, 'processed/')).filter((n) => n.includes(msg.runId)),
        [`processed/${month}/${code}/${msg.runId}.jpg`],
      );
      run = await runs.get(month, msg.runId);
      assert.equal(run.status, 'PENDING_REVIEW');
      assert.equal(run.blobContainer, cfg.names.blobContainer);

      // 3) the owner can open the proof; another user gets 404
      const proof = await request(app)
        .get(`/api/runs/${month}/${msg.runId}/proof`)
        .set(bearer(token))
        .buffer(true)
        .parse((res, cb) => {
          const chunks = [];
          res.on('data', (c) => chunks.push(c));
          res.on('end', () => cb(null, Buffer.concat(chunks)));
        })
        .expect(200);
      assert.equal(proof.headers['content-type'], 'image/jpeg');
      assert.deepEqual(proof.body, JPG);
      const stranger = await newUser();
      await request(app)
        .get(`/api/runs/${month}/${msg.runId}/proof`)
        .set(bearer(stranger.token))
        .expect(404);

      // 4) admin approves; approving twice conflicts
      await request(app)
        .post(`/api/admin/runs/${month}/${msg.runId}/approve`)
        .set(bearer(adminToken))
        .send({ note: 'looks good' })
        .expect(200);
      assert.equal((await runs.get(month, msg.runId)).status, 'APPROVED');
      await request(app)
        .post(`/api/admin/runs/${month}/${msg.runId}/approve`)
        .set(bearer(adminToken))
        .send({ note: 'again' })
        .expect(409);

      // 5) leaderboard shows the approved km for this user
      const lb = await request(app).get(`/api/leaderboard?month=${month}`).set('x-api-key', apiKey).expect(200);
      assert.deepEqual(lb.body.rows.find((r) => r.employeeCode === code), { employeeCode: code, km: 5.2, runs: 1 });
      const { body: { token: freshToken } } = await login(code, password).expect(200);
      const mine = await request(app).get(`/api/runs?month=${month}`)
        .set(bearer(freshToken)).expect(200);
      assert.deepEqual(mine.body.runs.map((r) => r.runId), [msg.runId]);

      // 6) audit trail has every step, and re-processing the same message is a no-op
      const actions = (await listAll(storage.audit)).filter((e) => e.runId === msg.runId).map((e) => e.action);
      for (const expected of ['UPLOAD', 'PROCESSED', 'APPROVED']) assert.ok(actions.includes(expected), `missing ${expected}`);
      assert.equal((await processMessage(msg, { storage })).status, 'already-processed');
    });
  });
});
