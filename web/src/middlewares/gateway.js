'use strict';
const crypto = require('node:crypto');

// Constant-time string compare (no early exit that leaks how many chars matched).
function safeEqual(a, b) {
  const x = Buffer.from(String(a)); const y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Only APIM knows the gateway secret (it adds X-Gateway-Secret to every call),
// so direct calls to *.azurewebsites.net get 403.
// /api/health stays open for the pipeline smoke test.
function requireGateway(secret) {
  return (req, res, next) => {
    if (req.path === '/api/health') return next();
    const v = req.get('x-gateway-secret');
    return v && safeEqual(v, secret) ? next() : res.status(403).json({ error: 'forbidden' });
  };
}

module.exports = { safeEqual, requireGateway };
