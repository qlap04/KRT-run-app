'use strict';
const express = require('express');
const { verifyCsrf } = require('../middlewares/csrf');
const { requireAdmin } = require('../middlewares/auth');

module.exports = function adminRoutes({ adminController }) {
  const r = express.Router();
  r.get('/admin', requireAdmin, adminController.reviewList);
  r.get('/admin/audit', requireAdmin, adminController.auditLog);
  r.post('/admin/runs/:month/:runId/approve', requireAdmin, verifyCsrf, adminController.approve);
  r.post('/admin/runs/:month/:runId/reject', requireAdmin, verifyCsrf, adminController.reject);
  return r;
};
