'use strict';
const express = require('express');

module.exports = function apiRoutes({ apiController, requireAuth }) {
  const r = express.Router();
  r.use('/api', express.json({ limit: '20kb' }));
  r.get('/api/health', apiController.health);
  r.post('/api/auth/login', apiController.login);
  r.post('/api/auth/register', apiController.register);
  r.get('/api/auth/me', requireAuth, apiController.me);
  r.get('/api/runs', apiController.apiAuth, apiController.runs);
  r.get('/api/leaderboard', apiController.apiAuth, apiController.leaderboard);
  return r;
};
