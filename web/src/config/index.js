'use strict';
// Reads configuration from environment variables (process.env) and validates the required ones.
const crypto = require('node:crypto');

function loadConfig(env = process.env) {
  const appEnv = env.APP_ENV || 'dev';
  if (!['dev', 'sit', 'uat', 'preprod', 'prod'].includes(appEnv)) {
    throw new Error(`Invalid APP_ENV: "${appEnv}" (dev | sit | uat | preprod | prod)`);
  }
  const isProd = appEnv === 'prod';
  const errors = [];

  const storageAccountName = env.STORAGE_ACCOUNT_NAME || '';
  const connectionString = env.STORAGE_CONNECTION_STRING || '';
  if (!storageAccountName && !connectionString) {
    errors.push('Missing STORAGE_ACCOUNT_NAME (Azure) or STORAGE_CONNECTION_STRING (local)');
  }

  let sessionSecret = env.SESSION_SECRET || '';
  let sessionSecretGenerated = false;
  if (!sessionSecret) {
    if (isProd) errors.push('Missing SESSION_SECRET (required in prod)');
    else {
      sessionSecret = crypto.randomBytes(32).toString('hex');
      sessionSecretGenerated = true;
    }
  }

  if (errors.length) {
    throw new Error('Invalid or missing configuration:\n - ' + errors.join('\n - '));
  }

  return {
    appEnv,
    isProd,
    port: Number(env.PORT || env.SERVER_PORT || 8080),
    storage: { accountName: storageAccountName, connectionString },
    names: {
      blobContainer: env.BLOB_CONTAINER || 'proofs',
      queue: env.QUEUE_NAME || 'upload-jobs',
      usersTable: env.TABLE_USERS || 'Users',
      runsTable: env.TABLE_RUNS || 'Runs',
      auditTable: env.TABLE_AUDIT || 'AuditLog',
    },
    sessionSecret,
    sessionSecretGenerated,
    adminCode: env.ADMIN_CODE || '',
    apiKey: env.API_KEY || '',
    gatewaySecret: env.GATEWAY_SECRET || '',
    ensureStorage: Boolean(connectionString) || env.ENSURE_STORAGE === 'true',
  };
}

module.exports = { loadConfig };
