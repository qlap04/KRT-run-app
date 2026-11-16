'use strict';
const { odata } = require('@azure/data-tables');

const STATUS = {
  PENDING_PROCESSING: 'PENDING_PROCESSING',
  PENDING_REVIEW: 'PENDING_REVIEW',
  REJECTED_INVALID: 'REJECTED_INVALID',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
};

async function collect(iter) {
  const out = [];
  for await (const e of iter) out.push(e);
  return out;
}

function createRunModel(table) {
  return {
    create: (run) => table.createEntity(run),
    async get(month, runId) {
      try {
        return await table.getEntity(month, runId);
      } catch (e) {
        if (e.statusCode === 404) return null;
        throw e;
      }
    },
    async listByMonth(month, { employeeCode, status } = {}) {
      let filter = odata`PartitionKey eq ${month}`;
      if (employeeCode) filter += ' and ' + odata`employeeCode eq ${employeeCode}`;
      if (status) filter += ' and ' + odata`status eq ${status}`;
      const rows = await collect(table.listEntities({ queryOptions: { filter } }));
      return rows.sort((a, b) => String(b.runDate).localeCompare(String(a.runDate)) ||
        String(b.createdUtc).localeCompare(String(a.createdUtc)));
    },
    merge: (entity) => table.updateEntity(entity, 'Merge'),
  };
}

module.exports = { STATUS, createRunModel };
