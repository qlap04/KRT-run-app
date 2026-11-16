'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../src/config');

// Config is injected as a plain object, so these tests do not depend on the real process.env.
const base = { STORAGE_ACCOUNT_NAME: 'acct' };

describe('config: defaults', () => {
  it('uses dev, default resource names and a generated session secret', () => {
    const c = loadConfig(base);
    assert.equal(c.appEnv, 'dev');
    assert.equal(c.isProd, false);
    assert.equal(c.port, 8080);
    assert.deepEqual(c.names, {
      blobContainer: 'proofs', queue: 'upload-jobs',
      usersTable: 'Users', runsTable: 'Runs', auditTable: 'AuditLog',
    });
    assert.equal(c.sessionSecretGenerated, true);
    assert.equal(c.sessionSecret.length, 64);
    assert.equal(c.ensureStorage, false);
  });
  it('generates a different session secret each time', () => {
    assert.notEqual(loadConfig(base).sessionSecret, loadConfig(base).sessionSecret);
  });
});

describe('config: APP_ENV', () => {
  for (const appEnv of ['dev', 'sit', 'uat', 'preprod']) {
    it(`accepts ${appEnv}`, () => {
      const c = loadConfig({ ...base, APP_ENV: appEnv });
      assert.equal(c.appEnv, appEnv);
      assert.equal(c.isProd, false);
    });
  }
  it('accepts prod when SESSION_SECRET is set', () => {
    const c = loadConfig({ ...base, APP_ENV: 'prod', SESSION_SECRET: 's3cret' });
    assert.equal(c.appEnv, 'prod');
    assert.equal(c.isProd, true);
    assert.equal(c.sessionSecretGenerated, false);
  });
  it('rejects prod without SESSION_SECRET', () => {
    assert.throws(() => loadConfig({ ...base, APP_ENV: 'prod' }), /SESSION_SECRET/);
  });
  it('rejects an unknown APP_ENV', () => {
    assert.throws(() => loadConfig({ ...base, APP_ENV: 'qa' }), /Invalid APP_ENV/);
  });
});

describe('config: storage and overrides', () => {
  it('requires STORAGE_ACCOUNT_NAME or STORAGE_CONNECTION_STRING', () => {
    assert.throws(() => loadConfig({}), /STORAGE_ACCOUNT_NAME/);
  });
  it('accepts a connection string alone and turns on ensureStorage', () => {
    const c = loadConfig({ STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true' });
    assert.equal(c.storage.connectionString, 'UseDevelopmentStorage=true');
    assert.equal(c.ensureStorage, true);
  });
  it('ENSURE_STORAGE=true turns on ensureStorage for an account name', () => {
    assert.equal(loadConfig({ ...base, ENSURE_STORAGE: 'true' }).ensureStorage, true);
  });
  it('reads resource names, secrets and port from the environment', () => {
    const c = loadConfig({
      ...base, PORT: '3000', ADMIN_CODE: 'ADM01', API_KEY: 'key', SESSION_SECRET: 'x',
      BLOB_CONTAINER: 'pr', QUEUE_NAME: 'q',
      TABLE_USERS: 'U', TABLE_RUNS: 'R', TABLE_AUDIT: 'A',
    });
    assert.equal(c.port, 3000);
    assert.equal(c.adminCode, 'ADM01');
    assert.equal(c.apiKey, 'key');
    assert.deepEqual(c.names, {
      blobContainer: 'pr', queue: 'q', usersTable: 'U', runsTable: 'R', auditTable: 'A',
    });
  });
  it('falls back to SERVER_PORT when PORT is not set', () => {
    assert.equal(loadConfig({ ...base, SERVER_PORT: '9000' }).port, 9000);
  });
});

describe('config: reads process.env by default', () => {
  let saved;
  beforeEach(() => { saved = { ...process.env }; });
  afterEach(() => {
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  });

  it('uses process.env when no object is passed', () => {
    process.env.APP_ENV = 'uat';
    process.env.STORAGE_ACCOUNT_NAME = 'from-process-env';
    const c = loadConfig();
    assert.equal(c.appEnv, 'uat');
    assert.equal(c.storage.accountName, 'from-process-env');
  });
});
