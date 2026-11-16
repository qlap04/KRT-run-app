'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../src/services/validation');

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

test('employee code', () => {
  assert.ok(v.isValidEmployeeCode('F12345'));
  assert.ok(!v.isValidEmployeeCode('ab'));
  assert.ok(!v.isValidEmployeeCode("a' or 1=1"));
});
test('password length', () => {
  assert.ok(v.isValidPassword('12345678'));
  assert.ok(!v.isValidPassword('1234567'));
});
test('km range and comma', () => {
  assert.ok(v.isValidKm('5,2'));
  assert.ok(v.isValidKm(100));
  assert.ok(!v.isValidKm('0'));
  assert.ok(!v.isValidKm('abc'));
  assert.ok(!v.isValidKm('101'));
  assert.equal(v.parseKm('5,256'), 5.26);
});
test('run date', () => {
  assert.equal(v.validateRunDate('2026-11-10', '2026-11-16'), null);
  assert.match(v.validateRunDate('2026-11-17', '2026-11-16'), /future/);
  assert.match(v.validateRunDate('2026-02-30', '2026-11-16'), /Invalid run date/);
  assert.match(v.validateRunDate('2026-01-01', '2026-11-16'), /too old/);
});
test('image magic bytes', () => {
  assert.equal(v.validateImage(JPG).ext, 'jpg');
  assert.equal(v.validateImage(PNG).ext, 'png');
  assert.ok(v.validateImage(Buffer.from('GIF89a-not-allowed')).error);
  assert.ok(v.validateImage(Buffer.alloc(0)).error);
  const big = Buffer.concat([JPG, Buffer.alloc(v.MAX_IMAGE_BYTES)]);
  assert.match(v.validateImage(big).error, /5MB/);
});
test('month + VN date', () => {
  assert.ok(v.isValidMonth('2026-11'));
  assert.ok(!v.isValidMonth('2026-13'));
  // 2026-11-15 18:00 UTC = 2026-11-16 01:00 VN
  assert.equal(v.todayVN(Date.UTC(2026, 10, 15, 18, 0)), '2026-11-16');
});
