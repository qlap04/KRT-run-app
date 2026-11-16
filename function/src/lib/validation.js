'use strict';
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

function detectImage(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => buf[i] === b)) return { ext: 'png', contentType: 'image/png' };
  return null;
}

function validateImage(buf) {
  if (!buf || buf.length === 0) return { error: 'Empty image' };
  if (buf.length > MAX_IMAGE_BYTES) return { error: 'Image exceeds 5MB' };
  const img = detectImage(buf);
  return img || { error: 'Not a JPG/PNG image' };
}

// Validates a queue message. Returns an error string or null.
function validateMessage(m) {
  if (!m || typeof m !== 'object') return 'message is not a JSON object';
  if (!/^[0-9a-f-]{36}$/.test(m.runId || '')) return 'invalid runId';
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(m.month || '')) return 'invalid month';
  if (!/^[A-Za-z0-9_-]{3,20}$/.test(m.employeeCode || '')) return 'invalid employeeCode';
  if (!/^[0-9a-f-]{36}\.(jpg|png)$/.test(m.blobName || '')) return 'invalid blobName';
  return null;
}

module.exports = { MAX_IMAGE_BYTES, detectImage, validateImage, validateMessage };
