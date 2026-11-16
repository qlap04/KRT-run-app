'use strict';
const crypto = require('node:crypto');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createApiController({ cfg, runService }) {
  function apiAuth(req, res, next) {
    const key = req.get('x-api-key');
    if (cfg.apiKey && key && safeEqual(key, cfg.apiKey)) { req.apiAll = true; return next(); }
    if (req.session.user) return next();
    res.status(401).json({ error: 'unauthorized' });
  }

  return {
    apiAuth,

    health(req, res) {
      res.json({ status: 'ok', env: cfg.appEnv, time: new Date().toISOString() });
    },

    async runs(req, res, next) {
      try {
        const data = await runService.apiRuns({
          monthQuery: req.query.month,
          apiAll: req.apiAll,
          sessionUser: req.session.user,
        });
        res.json(data);
      } catch (e) { next(e); }
    },

    async leaderboard(req, res, next) {
      try {
        res.json(await runService.apiLeaderboard(req.query.month));
      } catch (e) { next(e); }
    },
  };
}

module.exports = { createApiController };
