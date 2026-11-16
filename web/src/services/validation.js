'use strict';
// Pure functions (no Express / Azure dependency) so they are easy to test.
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_RUN_AGE_DAYS = 62;

const isValidEmployeeCode = (code) => typeof code === 'string' && /^[A-Za-z0-9_-]{3,20}$/.test(code);
const isValidPassword = (pw) => typeof pw === 'string' && pw.length >= 8 && pw.length <= 72;
const isValidMonth = (m) => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);

function isValidKm(value) {
  const km = typeof value === 'number' ? value : Number(String(value).replace(',', '.').trim());
  return Number.isFinite(km) && km >= 0.1 && km <= 100;
}
const parseKm = (value) => Math.round(Number(String(value).replace(',', '.').trim()) * 100) / 100;

function parseDateStr(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const d = new Date(s + 'T00:00:00Z');
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== s) return null;
  return d;
}

// today: yyyy-MM-dd string (Vietnam time), passed in so it can be tested
function validateRunDate(s, today) {
  const d = parseDateStr(s);
  if (!d) return 'Invalid run date (use yyyy-mm-dd)';
  const t = parseDateStr(today);
  if (d > t) return 'Run date cannot be in the future';
  const ageDays = (t - d) / 86400000;
  if (ageDays > MAX_RUN_AGE_DAYS) return `Run date is too old (max ${MAX_RUN_AGE_DAYS} days)`;
  return null;
}

// Detects the image by its magic bytes; the file name / Content-Type are not trusted.
function detectImage(buf) {
  if (!buf || buf.length < 8) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { ext: 'jpg', contentType: 'image/jpeg' };
  const png = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  if (png.every((b, i) => buf[i] === b)) return { ext: 'png', contentType: 'image/png' };
  return null;
}

function validateImage(buf) {
  if (!buf || buf.length === 0) return { error: 'No image selected' };
  if (buf.length > MAX_IMAGE_BYTES) return { error: 'Image too large (max 5MB)' };
  const img = detectImage(buf);
  if (!img) return { error: 'Only JPG or PNG images are accepted' };
  return img;
}

const todayVN = (now = Date.now()) => new Date(now + 7 * 3600 * 1000).toISOString().slice(0, 10);
const currentMonthVN = (now = Date.now()) => todayVN(now).slice(0, 7);

module.exports = {
  MAX_IMAGE_BYTES, isValidEmployeeCode, isValidPassword, isValidMonth, isValidKm, parseKm,
  validateRunDate, detectImage, validateImage, todayVN, currentMonthVN,
};
