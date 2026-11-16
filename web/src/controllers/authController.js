'use strict';
const { clientIp } = require('../middlewares/auth');

function createAuthController({ authService }) {
  return {
    showLogin(req, res) {
      res.render('auth/login', { error: null, code: '' });
    },

    async login(req, res, next) {
      try {
        const result = await authService.login({
          employeeCode: req.body.employeeCode,
          password: req.body.password,
          clientIp: clientIp(req),
        });
        if (!result.ok) {
          return res.status(401).render('auth/login', { error: result.error, code: result.code });
        }
        req.session.regenerate((err) => {
          if (err) return next(err);
          req.session.user = result.sessionUser;
          authService.recordLoginSuccess({ code: result.code, clientIp: result.clientIp });
          res.redirect('/runs');
        });
      } catch (e) { next(e); }
    },

    showRegister(req, res) {
      res.render('auth/register', { error: null, form: {} });
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
          return res.status(400).render('auth/register', { error: result.error, form: result.form });
        }
        res.redirect('/login');
      } catch (e) { next(e); }
    },

    logout(req, res) {
      req.session.destroy(() => res.redirect('/login'));
    },
  };
}

module.exports = { createAuthController };
