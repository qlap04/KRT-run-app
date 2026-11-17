'use strict';
const multer = require('multer');
const v = require('../services/validation');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: v.MAX_IMAGE_BYTES + 1, files: 1 },
});

function proofUploadError(err, req, res) {
  const msg = err.code === 'LIMIT_FILE_SIZE' ? 'Image too large (max 5MB)' : 'File upload error';
  return res.status(400).json({ error: msg });
}

// Parses multipart; on LIMIT_FILE_SIZE returns JSON 400.
function proofUpload(req, res, next) {
  upload.single('proof')(req, res, (err) => {
    if (err) return proofUploadError(err, req, res);
    next();
  });
}

module.exports = { proofUpload, proofUploadError };
