'use strict';

function notFound(req, res) {
  res.status(404).render('error', { message: 'Page not found.' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error('[error]', err && err.message);
  if (req.path.startsWith('/api/')) return res.status(500).json({ error: 'internal' });
  res.status(500).render('error', { message: 'Something went wrong. Please try again later.' });
}

module.exports = { notFound, errorHandler };
