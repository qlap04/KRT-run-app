'use strict';
const crypto = require('node:crypto');

function csrfToken(req) {
  if (!req.session.csrf) req.session.csrf = crypto.randomBytes(24).toString('hex');
  return req.session.csrf;
}

// CSRF check for POST requests (runs AFTER multer on the upload route)
function verifyCsrf(req, res, next) {
  const sent = (req.body && req.body._csrf) || '';
  const expected = req.session.csrf || '';
  const a = Buffer.from(String(sent));
  const b = Buffer.from(String(expected));
  if (!expected || a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    return res.status(403).render('error', { message: 'Invalid session (CSRF). Please reload the page.' });
  }
  next();
}

module.exports = { csrfToken, verifyCsrf };
