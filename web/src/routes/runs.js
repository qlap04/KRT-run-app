'use strict';
const express = require('express');
const { verifyCsrf } = require('../middlewares/csrf');
const { requireLogin } = require('../middlewares/auth');
const { proofUpload } = require('../middlewares/upload');

module.exports = function runsRoutes({ runController }) {
  const r = express.Router();
  r.get('/', runController.home);
  r.get('/runs', requireLogin, runController.list);
  r.get('/upload', requireLogin, runController.showUpload);
  r.post('/upload', requireLogin, proofUpload, verifyCsrf, runController.upload);
  r.get('/leaderboard', requireLogin, runController.leaderboard);
  r.get('/proof/:month/:runId', requireLogin, runController.proof);
  return r;
};
