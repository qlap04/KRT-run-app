'use strict';
const express = require('express');
const { proofUpload } = require('../middlewares/upload');

module.exports = function apiRoutes({ apiController, adminApiController, requireAuth, requireAdminApi }) {
  const r = express.Router();
  r.use('/api', express.json({ limit: '20kb' }));
  r.get('/api/health', apiController.health);
  r.post('/api/auth/login', apiController.login);
  r.post('/api/auth/register', apiController.register);
  r.get('/api/auth/me', requireAuth, apiController.me);
  r.get('/api/runs', apiController.apiAuth, apiController.runs);
  r.post('/api/runs', requireAuth, proofUpload, apiController.upload);
  r.get('/api/runs/:month/:runId/proof', requireAuth, apiController.proof);
  r.get('/api/leaderboard', apiController.apiAuth, apiController.leaderboard);
  r.get('/api/admin/runs', requireAuth, requireAdminApi, adminApiController.reviewList);
  r.get('/api/admin/audit', requireAuth, requireAdminApi, adminApiController.auditLog);
  r.post('/api/admin/runs/:month/:runId/approve', requireAuth, requireAdminApi, adminApiController.approve);
  r.post('/api/admin/runs/:month/:runId/reject', requireAuth, requireAdminApi, adminApiController.reject);
  return r;
};
