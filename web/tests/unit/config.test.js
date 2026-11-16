'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { loadConfig } = require('../../src/config');

test('dev defaults and generated secret', () => {
  const c = loadConfig({ STORAGE_ACCOUNT_NAME: 'acct' });
  assert.equal(c.appEnv, 'dev');
  assert.equal(c.names.queue, 'upload-jobs');
  assert.ok(c.sessionSecretGenerated);
});
test('prod requires SESSION_SECRET', () => {
  assert.throws(() => loadConfig({ APP_ENV: 'prod', STORAGE_ACCOUNT_NAME: 'a' }), /SESSION_SECRET/);
});
test('requires storage settings', () => {
  assert.throws(() => loadConfig({}), /STORAGE_ACCOUNT_NAME/);
});
test('invalid APP_ENV', () => {
  assert.throws(() => loadConfig({ APP_ENV: 'qa', STORAGE_ACCOUNT_NAME: 'a' }), /APP_ENV/);
});
test('all five environments are accepted', () => {
  for (const e of ['dev', 'sit', 'uat', 'preprod']) {
    assert.equal(loadConfig({ APP_ENV: e, STORAGE_ACCOUNT_NAME: 'a' }).appEnv, e);
  }
  assert.equal(loadConfig({ APP_ENV: 'prod', STORAGE_ACCOUNT_NAME: 'a', SESSION_SECRET: 's' }).appEnv, 'prod');
});
