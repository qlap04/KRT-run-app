'use strict';
const multer = require('multer');
const v = require('../services/validation');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: v.MAX_IMAGE_BYTES + 1, files: 1 },
});

// Parses multipart; on LIMIT_FILE_SIZE re-renders the upload form.
function proofUpload(req, res, next) {
  upload.single('proof')(req, res, (err) => {
    if (err) {
      const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image too large (max 5MB)' : 'File upload error';
      return res.status(400).render('runs/upload', { error: msg, form: {}, today: v.todayVN(), ok: false });
    }
    next();
  });
}

module.exports = { proofUpload };
