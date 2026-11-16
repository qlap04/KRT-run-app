'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { validateMessage, validateImage, detectImage, MAX_IMAGE_BYTES } = require('../../src/lib/validation');

const RUN_ID = '11111111-1111-1111-1111-111111111111';
const valid = { runId: RUN_ID, month: '2026-11', employeeCode: 'F001', blobName: `${RUN_ID}.jpg` };

describe('validateMessage', () => {
  it('accepts a well-formed message (jpg and png)', () => {
    assert.equal(validateMessage(valid), null);
    assert.equal(validateMessage({ ...valid, blobName: `${RUN_ID}.png` }), null);
  });
  it('rejects non-objects', () => {
    for (const m of [null, undefined, 'text', 42]) assert.equal(validateMessage(m), 'message is not a JSON object', String(m));
  });
  for (const [field, value, error] of [
    ['runId', 'not-a-uuid', 'invalid runId'],
    ['month', '2026-13', 'invalid month'],
    ['employeeCode', 'x', 'invalid employeeCode'],
    ['blobName', '../etc/passwd', 'invalid blobName'],
    ['blobName', `${RUN_ID}.gif`, 'invalid blobName'],
    ['blobName', undefined, 'invalid blobName'],
  ]) {
    it(`rejects ${field}=${String(value)}`, () => {
      assert.equal(validateMessage({ ...valid, [field]: value }), error);
    });
  }
});

describe('validateImage', () => {
  const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(20, 1)]);
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(20, 1)]);

  it('detects JPG and PNG by content', () => {
    assert.equal(validateImage(JPG).ext, 'jpg');
    assert.equal(validateImage(PNG).contentType, 'image/png');
  });
  it('rejects empty, oversized and unsupported files', () => {
    assert.equal(validateImage(Buffer.alloc(0)).error, 'Empty image');
    assert.equal(validateImage(Buffer.alloc(MAX_IMAGE_BYTES + 1)).error, 'Image exceeds 5MB');
    assert.equal(validateImage(Buffer.from('GIF89a-not-allowed')).error, 'Not a JPG/PNG image');
  });
  it('detectImage returns null for tiny buffers', () => {
    assert.equal(detectImage(Buffer.from([0xff, 0xd8])), null);
  });
});
