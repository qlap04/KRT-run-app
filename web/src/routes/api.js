'use strict';
const express = require('express');

module.exports = function apiRoutes({ apiController }) {
  const r = express.Router();
  r.get('/api/health', apiController.health);
  r.get('/api/runs', apiController.apiAuth, apiController.runs);
  r.get('/api/leaderboard', apiController.apiAuth, apiController.leaderboard);
  return r;
};
