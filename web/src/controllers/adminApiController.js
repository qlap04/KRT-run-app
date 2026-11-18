'use strict';
const { clientIp } = require('../middlewares/auth');
const { STATUS } = require('../models/Run');

function createAdminApiController({ runService, auditService }) {
  return {
    async reviewList(req, res, next) {
      try {
        res.json(await runService.pendingReview(req.query.month));
      } catch (e) { next(e); }
    },

    async auditLog(req, res, next) {
      try {
        res.json(await auditService.listForDate(req.query.date));
      } catch (e) { next(e); }
    },

    async approve(req, res, next) {
      return review(req, res, next, STATUS.APPROVED);
    },

    async reject(req, res, next) {
      return review(req, res, next, STATUS.REJECTED);
    },
  };

  async function review(req, res, next, newStatus) {
    try {
      const result = await runService.review({
        month: req.params.month,
        runId: req.params.runId,
        newStatus,
        note: req.body.note,
        actor: req.user.code,
        clientIp: clientIp(req),
      });
      if (result.notFound) return res.sendStatus(404);
      if (result.conflict) return res.status(409).json({ error: result.message });
      res.json({ ok: true });
    } catch (e) { next(e); }
  }
}

module.exports = { createAdminApiController };
