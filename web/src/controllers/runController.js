'use strict';
const { clientIp } = require('../middlewares/auth');

function createRunController({ runService }) {
  return {
    home(req, res) {
      res.redirect(req.session.user ? '/runs' : '/login');
    },

    async list(req, res, next) {
      try {
        const data = await runService.myRuns(req.query.month, req.session.user.code);
        res.render('runs/runs', data);
      } catch (e) { next(e); }
    },

    showUpload(req, res) {
      const today = runService.todayVN();
      res.render('runs/upload', {
        error: null,
        form: { runDate: today },
        today,
        ok: req.query.ok === '1',
      });
    },

    async upload(req, res, next) {
      try {
        const result = await runService.upload({
          user: req.session.user,
          km: req.body.km,
          runDate: req.body.runDate,
          file: req.file,
          clientIp: clientIp(req),
        });
        if (!result.ok) {
          return res.status(400).render('runs/upload', {
            error: result.error,
            form: result.form,
            today: runService.todayVN(),
            ok: false,
          });
        }
        res.redirect('/upload?ok=1');
      } catch (e) { next(e); }
    },

    async leaderboard(req, res, next) {
      try {
        const data = await runService.leaderboardPage(req.query.month);
        res.render('runs/leaderboard', data);
      } catch (e) { next(e); }
    },

    async proof(req, res, next) {
      try {
        const result = await runService.openProof({
          month: req.params.month,
          runId: req.params.runId,
          user: req.session.user,
        });
        if (result.notFound) return res.sendStatus(404);
        res.setHeader('Content-Type', result.contentType);
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('X-Content-Type-Options', 'nosniff');
        result.stream.on('error', next).pipe(res);
      } catch (e) { e.statusCode === 404 ? res.sendStatus(404) : next(e); }
    },
  };
}

module.exports = { createRunController };
