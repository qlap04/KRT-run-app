'use strict';
// AuditLog is append-only (createEntity only). There is no update/delete function.
const crypto = require('node:crypto');

function auditKeys(now = new Date()) {
  const reverse = (9999999999999n - BigInt(now.getTime())).toString().padStart(13, '0');
  return { partitionKey: now.toISOString().slice(0, 10), rowKey: `${reverse}_${crypto.randomUUID()}` };
}

function createAuditLog(table) {
  return {
    async append({ action, actor, runId = '', km = '', runDate = '', result = 'OK', clientIp = '', detail = '' }) {
      const entity = {
        ...auditKeys(),
        action, actor, runId, km: km === '' ? '' : Number(km), runDate, result, clientIp,
        detail: String(detail).slice(0, 500),
      };
      await table.createEntity(entity);
      return entity;
    },
    async listByDate(date, limit = 200) {
      const out = [];
      const { odata } = require('@azure/data-tables');
      for await (const e of table.listEntities({ queryOptions: { filter: odata`PartitionKey eq ${date}` } })) {
        out.push(e);
        if (out.length >= limit) break;
      }
      return out;
    },
  };
}

module.exports = { createAuditLog, auditKeys };
