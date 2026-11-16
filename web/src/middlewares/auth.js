'use strict';

const requireLogin = (req, res, next) => (req.session.user ? next() : res.redirect('/login'));

function requireAdmin(req, res, next) {
  if (!req.session.user) return res.redirect('/login');
  if (req.session.user.role !== 'admin') return res.status(403).render('error', { message: 'Admins only.' });
  next();
}

const clientIp = (req) => req.ip || req.socket.remoteAddress || '';

module.exports = { requireLogin, requireAdmin, clientIp };
