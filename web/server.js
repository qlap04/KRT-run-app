'use strict';
const { loadConfig } = require('./src/config');
const { createStorage } = require('./src/services/storageService');
const { createUserModel } = require('./src/models/User');
const { createRunModel } = require('./src/models/Run');
const { createAuditLog } = require('./src/models/AuditLog');
const { createAuthService } = require('./src/services/authService');
const { createRunService } = require('./src/services/runService');
const { createAuditService } = require('./src/services/auditService');
const { createApp } = require('./src/app');

async function main() {
  const cfg = loadConfig();
  if (cfg.sessionSecretGenerated) console.warn('[warn] SESSION_SECRET is not set: using a random secret (sessions are lost on restart)');
  const storage = createStorage(cfg);
  if (cfg.ensureStorage) await storage.ensure().catch((e) => { if (e.statusCode !== 409) throw e; });

  const users = createUserModel(storage.users);
  const runs = createRunModel(storage.runs);
  const audit = createAuditLog(storage.audit);

  const authService = createAuthService({ cfg, users, audit });
  const runService = createRunService({ cfg, storage, runs, audit });
  const auditService = createAuditService({ audit });

  const app = createApp({ cfg, authService, runService, auditService });
  app.listen(cfg.port, () => console.log(`KRT-run web [${cfg.appEnv}] listening on :${cfg.port}`));
}

main().catch((e) => { console.error(e.message); process.exit(1); });
