'use strict';
function loadConfig(env = process.env) {
  const cs = env.STORAGE_CONNECTION_STRING || '';
  const acct = env.STORAGE_ACCOUNT_NAME || '';
  if (!cs && !acct) throw new Error('Missing STORAGE_ACCOUNT_NAME or STORAGE_CONNECTION_STRING');
  return {
    appEnv: env.APP_ENV || 'dev',
    connectionString: cs,
    accountName: acct,
    blobContainer: env.BLOB_CONTAINER || 'proofs',
    runsTable: env.TABLE_RUNS || 'Runs',
    auditTable: env.TABLE_AUDIT || 'AuditLog',
  };
}
module.exports = { loadConfig };
