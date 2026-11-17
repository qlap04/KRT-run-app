'use strict';
const { describe, it, mock } = require('node:test');
const assert = require('node:assert/strict');
const { fakeReq, fakeRes } = require('../helpers/http');
const { clientIp } = require('../../src/middlewares/auth');
const { notFound, errorHandler } = require('../../src/middlewares/errorHandler');
const { proofUploadError } = require('../../src/middlewares/upload');

describe('auth middleware', () => {
  it('clientIp prefers req.ip and falls back to the socket address', () => {
    assert.equal(clientIp({ ip: '1.1.1.1', socket: { remoteAddress: '2.2.2.2' } }), '1.1.1.1');
    assert.equal(clientIp({ socket: { remoteAddress: '2.2.2.2' } }), '2.2.2.2');
  });
});

describe('error handler', () => {
  it('notFound answers 404 JSON', () => {
    const res = fakeRes();
    notFound(fakeReq(), res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { error: 'not found' });
  });
  it('errorHandler answers JSON without leaking the error detail', (t) => {
    t.mock.method(console, 'error', () => {});
    const res = fakeRes();
    errorHandler(new Error('secret detail'), { path: '/api/runs' }, res, () => {});
    assert.equal(res.statusCode, 500);
    assert.deepEqual(res.body, { error: 'internal' });
    assert.doesNotMatch(JSON.stringify(res.body), /secret detail/);
  });
});

describe('proofUpload errors', () => {
  it('returns 400 JSON for oversized files', () => {
    const res = fakeRes();
    proofUploadError({ code: 'LIMIT_FILE_SIZE' }, fakeReq(), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'Image too large (max 5MB)' });
  });
  it('returns 400 JSON for other upload errors', () => {
    const res = fakeRes();
    proofUploadError({ code: 'OTHER' }, fakeReq(), res);
    assert.equal(res.statusCode, 400);
    assert.deepEqual(res.body, { error: 'File upload error' });
  });
});
