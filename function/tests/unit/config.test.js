'use strict';
const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../src/lib/config');

describe('function config', () => {
  it('uses defaults when only the account name is given', () => {
    assert.deepEqual(loadConfig({ STORAGE_ACCOUNT_NAME: 'acct' }), {
      appEnv: 'dev', connectionString: '', accountName: 'acct', blobContainer: 'proofs',
      runsTable: 'Runs', auditTable: 'AuditLog',
    });
  });
  it('accepts a connection string alone', () => {
    assert.equal(loadConfig({ STORAGE_CONNECTION_STRING: 'UseDevelopmentStorage=true' }).connectionString, 'UseDevelopmentStorage=true');
  });
  it('reads the overrides', () => {
    const c = loadConfig({
      STORAGE_ACCOUNT_NAME: 'a', APP_ENV: 'uat', BLOB_CONTAINER: 'pr',
      TABLE_RUNS: 'R', TABLE_AUDIT: 'A',
    });
    assert.deepEqual([c.appEnv, c.blobContainer, c.runsTable, c.auditTable], ['uat', 'pr', 'R', 'A']);
  });
  it('fails clearly when no storage setting exists', () => {
    assert.throws(() => loadConfig({}), /STORAGE_ACCOUNT_NAME or STORAGE_CONNECTION_STRING/);
  });

  describe('default environment', () => {
    let saved;
    beforeEach(() => { saved = { ...process.env }; });
    afterEach(() => {
      for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
      Object.assign(process.env, saved);
    });

    it('reads process.env when no object is passed', () => {
      delete process.env.STORAGE_CONNECTION_STRING;
      process.env.STORAGE_ACCOUNT_NAME = 'from-process-env';
      assert.equal(loadConfig().accountName, 'from-process-env');
    });
  });
});
