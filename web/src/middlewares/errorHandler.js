'use strict';

function notFound(req, res) {
  res.status(404).json({ error: 'not found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err && err.message);
  res.status(500).json({ error: 'internal' });
}

module.exports = { notFound, errorHandler };
