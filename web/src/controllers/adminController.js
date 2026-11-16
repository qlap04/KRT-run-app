'use strict';
const { clientIp } = require('../middlewares/auth');
const { STATUS } = require('../models/Run');

function createAdminController({ runService, auditService }) {
  return {
    async reviewList(req, res, next) {
      try {
        const data = await runService.pendingReview(req.query.month);
        res.render('admin/admin', data);
      } catch (e) { next(e); }
    },

    async auditLog(req, res, next) {
      try {
        const data = await auditService.listForDate(req.query.date);
        res.render('admin/audit', data);
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
        actor: req.session.user.code,
        clientIp: clientIp(req),
      });
      if (result.notFound) return res.sendStatus(404);
      if (result.conflict) return res.status(409).render('error', { message: result.message });
      res.redirect(`/admin?month=${result.month}`);
    } catch (e) { next(e); }
  }
}

module.exports = { createAdminController };
