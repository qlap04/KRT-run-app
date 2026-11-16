'use strict';
// Integration tests: real Express app + real Blob/Queue/Table clients against a storage emulator (Azurite).
//
// Configuration comes ONLY from environment variables:
//   STORAGE_CONNECTION_STRING   required, e.g. UseDevelopmentStorage=true with Azurite running
//   INTEGRATION_REQUIRED=true   optional, fail instead of skip when the connection string is missing (use in CI)
//
// Every run creates its own containers, queue and tables (random suffix) and deletes them in after(),
// so runs never share data. Each test registers its own users, so tests do not depend on each other.
// The only ordered scenario is the single end-to-end flow test.
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
  let cfg, storage, app, runs, audit, processMessage, todayVN;

  const csrfFrom = async (agent, path) => {
    const res = await agent.get(path).expect(200);
    const m = /name="_csrf" value="([^"]+)"/.exec(res.text);
    assert.ok(m, `no csrf token found at ${path}`);
    return m[1];
  };
  const register = async (agent, code, password, fullName = 'Test User') => {
    const t = await csrfFrom(agent, '/register');
    return agent.post('/register').type('form')
      .send({ _csrf: t, employeeCode: code, fullName, password, password2: password });
  };
  const login = async (agent, code, password) => {
    const t = await csrfFrom(agent, '/login');
    return agent.post('/login').type('form').send({ _csrf: t, employeeCode: code, password });
  };
  // Registers a brand-new user and returns a logged-in agent for it.
  const newUser = async (prefix = 'U') => {
    const code = `${prefix}${rand()}`;
    const password = newPassword();
    const agent = request.agent(app);
    await register(agent, code, password).then((r) => assert.equal(r.status, 302));
    await login(agent, code, password).then((r) => assert.equal(r.status, 302));
    return { agent, code, password };
  };
  const upload = async (agent, { km = '5,2', runDate = todayVN(), file = JPG, filename = 'run.jpg' } = {}) => {
    const t = await csrfFrom(agent, '/upload');
    return agent.post('/upload').field('_csrf', t).field('runDate', runDate).field('km', km)
      .attach('proof', file, { filename, contentType: 'image/jpeg' });
  };
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
    await register(request.agent(app), adminCode, adminPassword, 'Admin').then((r) => assert.equal(r.status, 302));
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
    it('unknown pages answer 404', async () => {
      await request(app).get(`/no-such-page-${suffix}`).expect(404);
    });
  });

  describe('access control', () => {
    it('anonymous users are redirected to /login', async () => {
      await request(app).get('/runs').expect(302).expect('Location', '/login');
      await request(app).get('/admin').expect(302).expect('Location', '/login');
    });
    it('the API answers 401 without a session or API key, and 401 with a wrong key', async () => {
      await request(app).get('/api/runs').expect(401);
      await request(app).get('/api/leaderboard').set('x-api-key', 'wrong').expect(401);
    });
    it('a valid API key can read the API', async () => {
      const r = await request(app).get('/api/leaderboard').set('x-api-key', apiKey).expect(200);
      assert.ok(Array.isArray(r.body.rows));
    });
    it('a normal user cannot open the admin pages (403)', async () => {
      const { agent } = await newUser();
      await agent.get('/admin').expect(403);
      await agent.get('/admin/audit').expect(403);
    });
    it('POST without a CSRF token is rejected (403)', async () => {
      const agent = request.agent(app);
      await agent.get('/login').expect(200); // creates the session
      await agent.post('/login').type('form').send({ employeeCode: 'x', password: 'y' }).expect(403);
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
      const r = await register(request.agent(app), code, newPassword());
      assert.equal(r.status, 400);
      assert.match(r.text, /already registered/);
    });
    it('rejects a wrong password with 401 and writes a FAILED audit record', async () => {
      const { code } = await newUser();
      const r = await login(request.agent(app), code, 'wrong-password');
      assert.equal(r.status, 401);
      const failed = (await listAll(storage.audit)).filter((e) => e.actor === code && e.result === 'FAILED');
      assert.equal(failed.length, 1);
    });
    it('logout ends the session', async () => {
      const { agent } = await newUser();
      await agent.get('/runs').expect(200);
      const t = await csrfFrom(agent, '/runs');
      await agent.post('/logout').type('form').send({ _csrf: t }).expect(302).expect('Location', '/login');
      await agent.get('/runs').expect(302).expect('Location', '/login');
    });
  });

  describe('upload validation', () => {
    it('rejects a non-image file and stores nothing for that user', async () => {
      const { agent, code } = await newUser();
      const before = (await listBlobs(storage.blobs)).length;
      await upload(agent, { file: Buffer.from('this is not an image') }).then((r) => assert.equal(r.status, 400));
      assert.equal((await listBlobs(storage.blobs)).length, before);
      assert.deepEqual(await queueMessagesFor(code), []);
      assert.deepEqual((await listAll(storage.runs)).filter((r) => r.employeeCode === code), []);
    });
    it('rejects an invalid distance and a future date', async () => {
      const { agent, code } = await newUser();
      await upload(agent, { km: '500' }).then((r) => assert.equal(r.status, 400));
      await upload(agent, { runDate: '2999-01-01' }).then((r) => assert.equal(r.status, 400));
      assert.deepEqual((await listAll(storage.runs)).filter((r) => r.employeeCode === code), []);
    });
    it('requires a login to upload', async () => {
      await request(app).get('/upload').expect(302).expect('Location', '/login');
    });
  });

  describe('end-to-end flow (ordered steps in one test)', () => {
    it('upload -> function processing -> proof -> admin approval -> leaderboard', async () => {
      const { agent, code } = await newUser('RUN');
      const admin = request.agent(app);
      await login(admin, adminCode, adminPassword).then((r) => assert.equal(r.status, 302));

      // 1) upload: blob under incoming/, queue message, run PENDING_PROCESSING
      const day = todayVN();
      const month = day.slice(0, 7);
      await upload(agent, { km: '5,2', runDate: day }).then((r) => {
        assert.equal(r.status, 302);
        assert.equal(r.headers.location, '/upload?ok=1');
      });
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
      const proof = await agent.get(`/proof/${month}/${msg.runId}`).buffer(true).parse((res, cb) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => cb(null, Buffer.concat(chunks)));
      }).expect(200);
      assert.equal(proof.headers['content-type'], 'image/jpeg');
      assert.deepEqual(proof.body, JPG);
      const stranger = await newUser();
      await stranger.agent.get(`/proof/${month}/${msg.runId}`).expect(404);

      // 4) admin approves; approving twice conflicts
      const t = await csrfFrom(admin, '/admin');
      await admin.post(`/admin/runs/${month}/${msg.runId}/approve`).type('form').send({ _csrf: t }).expect(302);
      assert.equal((await runs.get(month, msg.runId)).status, 'APPROVED');
      await admin.post(`/admin/runs/${month}/${msg.runId}/approve`).type('form').send({ _csrf: t }).expect(409);

      // 5) leaderboard shows the approved km for this user
      const lb = await request(app).get(`/api/leaderboard?month=${month}`).set('x-api-key', apiKey).expect(200);
      assert.deepEqual(lb.body.rows.find((r) => r.employeeCode === code), { employeeCode: code, km: 5.2, runs: 1 });
      const mine = await agent.get(`/api/runs?month=${month}`).expect(200);
      assert.deepEqual(mine.body.runs.map((r) => r.runId), [msg.runId]);

      // 6) audit trail has every step, and re-processing the same message is a no-op
      const actions = (await listAll(storage.audit)).filter((e) => e.runId === msg.runId).map((e) => e.action);
      for (const expected of ['UPLOAD', 'PROCESSED', 'APPROVED']) assert.ok(actions.includes(expected), `missing ${expected}`);
      assert.equal((await processMessage(msg, { storage })).status, 'already-processed');
    });
  });
});
