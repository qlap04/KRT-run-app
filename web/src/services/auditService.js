'use strict';
const v = require('./validation');

function createAuditService({ audit }) {
  return {
    async listForDate(queryDate) {
      const date = /^\d{4}-\d{2}-\d{2}$/.test(queryDate || '') ? queryDate : v.todayVN();
      return { date, rows: await audit.listByDate(date) };
    },
  };
}

module.exports = { createAuditService };
