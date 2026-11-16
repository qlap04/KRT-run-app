'use strict';
// AuditLog is append-only (createEntity only).
const crypto = require('node:crypto');
async function appendAudit(table, { action, actor, runId = '', km = '', runDate = '', result = 'OK', clientIp = '', detail = '' }) {
  const now = new Date();
  const reverse = (9999999999999n - BigInt(now.getTime())).toString().padStart(13, '0');
  await table.createEntity({
    partitionKey: now.toISOString().slice(0, 10), rowKey: `${reverse}_${crypto.randomUUID()}`,
    action, actor, runId, km: km === '' ? '' : Number(km), runDate, result, clientIp,
    detail: String(detail).slice(0, 500),
  });
}
module.exports = { appendAudit };
