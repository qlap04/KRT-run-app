'use strict';
const crypto = require('node:crypto');
const { clientIp } = require('../middlewares/auth');

function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

function createApiController({ cfg, runService, authService, signToken, requireAuth }) {
  function apiAuth(req, res, next) {
    const key = req.get('x-api-key');
    if (cfg.apiKey && key && safeEqual(key, cfg.apiKey)) {
      req.apiAll = true;
      return next();
    }
    return requireAuth(req, res, next);
  }

  return {
    apiAuth,

    health(req, res) {
      res.json({ status: 'ok', env: cfg.appEnv, time: new Date().toISOString() });
    },

    async login(req, res, next) {
      try {
        const result = await authService.login({
          employeeCode: req.body.employeeCode,
          password: req.body.password,
          clientIp: clientIp(req),
        });
        if (!result.ok) {
          return res.status(401).json({ error: result.error });
        }
        authService.recordLoginSuccess({ code: result.code, clientIp: result.clientIp });
        const user = result.sessionUser;
        res.json({ token: signToken(user), user });
      } catch (e) { next(e); }
    },

    async register(req, res, next) {
      try {
        const result = await authService.register({
          employeeCode: req.body.employeeCode,
          fullName: req.body.fullName,
          password: req.body.password,
          password2: req.body.password2,
          clientIp: clientIp(req),
        });
        if (!result.ok) {
          return res.status(result.statusCode || 400).json({ error: result.error });
        }
        res.json({ ok: true });
      } catch (e) { next(e); }
    },

    me(req, res) {
      res.json(req.user);
    },

    async runs(req, res, next) {
      try {
        const data = await runService.apiRuns({
          monthQuery: req.query.month,
          apiAll: req.apiAll,
          sessionUser: req.user,
        });
        res.json(data);
      } catch (e) { next(e); }
    },

    async upload(req, res, next) {
      try {
        const result = await runService.upload({
          user: req.user,
          km: req.body.km,
          runDate: req.body.runDate,
          file: req.file,
          clientIp: clientIp(req),
        });
        if (!result.ok) {
          return res.status(400).json({ error: result.error });
        }
        res.status(201).json({ ok: true });
      } catch (e) { next(e); }
    },

    async proof(req, res, next) {
      try {
        const result = await runService.openProof({
          month: req.params.month,
          runId: req.params.runId,
          user: req.user,
        });
        if (result.notFound) return res.sendStatus(404);
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        result.stream.on('error', next).pipe(res);
      } catch (e) { e.statusCode === 404 ? res.sendStatus(404) : next(e); }
    },

    async leaderboard(req, res, next) {
      try {
        res.json(await runService.apiLeaderboard(req.query.month));
      } catch (e) { next(e); }
    },
  };
}

module.exports = { createApiController };
