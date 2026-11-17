'use strict';
const jwt = require('jsonwebtoken');

function createJwt({ cfg }) {
  function signToken(user) {
    return jwt.sign(
      { code: user.code, fullName: user.fullName, role: user.role },
      cfg.sessionSecret,
      { expiresIn: '1h', algorithm: 'HS256' },
    );
  }

  function requireAuth(req, res, next) {
    const header = req.get('authorization') || '';
    const match = /^Bearer\s+(.+)$/i.exec(header);
    if (!match) return res.status(401).json({ error: 'unauthorized' });
    try {
      const payload = jwt.verify(match[1], cfg.sessionSecret, { algorithms: ['HS256'] });
      req.user = { code: payload.code, fullName: payload.fullName, role: payload.role };
      return next();
    } catch {
      return res.status(401).json({ error: 'unauthorized' });
    }
  }

  function requireAdminApi(req, res, next) {
    if (!req.user || req.user.role !== 'admin') {
      return res.status(403).json({ error: 'forbidden' });
    }
    return next();
  }

  return { signToken, requireAuth, requireAdminApi };
}

module.exports = { createJwt };
