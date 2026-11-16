'use strict';
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const v = require('../../src/services/validation');

const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 0x10, 0x4a, 0x46, 0x49, 0x46]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);

describe('validation: employee code', () => {
  it('accepts 3-20 letters, digits, dash and underscore', () => {
    for (const code of ['F12345', 'abc', 'a-b_c', 'A'.repeat(20)]) assert.ok(v.isValidEmployeeCode(code), code);
  });
  it('rejects too short, too long, bad characters and non-strings', () => {
    for (const code of ['ab', 'A'.repeat(21), "a' or 1=1", 'a b', '', null, undefined, 123]) {
      assert.ok(!v.isValidEmployeeCode(code), String(code));
    }
  });
});

describe('validation: password', () => {
  it('accepts 8 to 72 characters', () => {
    assert.ok(v.isValidPassword('12345678'));
    assert.ok(v.isValidPassword('x'.repeat(72)));
  });
  it('rejects shorter, longer and non-strings', () => {
    assert.ok(!v.isValidPassword('1234567'));
    assert.ok(!v.isValidPassword('x'.repeat(73)));
    assert.ok(!v.isValidPassword(undefined));
  });
});

describe('validation: km', () => {
  it('accepts values in range, including a decimal comma', () => {
    for (const km of ['5,2', '5.2', 100, '0.1', ' 7 ']) assert.ok(v.isValidKm(km), String(km));
  });
  it('rejects zero, out of range and non-numbers', () => {
    for (const km of ['0', '0.09', '100.01', '101', 'abc', '', NaN]) assert.ok(!v.isValidKm(km), String(km));
  });
  it('parseKm rounds to 2 decimals and understands the comma', () => {
    assert.equal(v.parseKm('5,256'), 5.26);
    assert.equal(v.parseKm('10'), 10);
  });
});

describe('validation: run date', () => {
  const today = '2026-11-16';
  it('accepts today and recent days', () => {
    assert.equal(v.validateRunDate('2026-11-16', today), null);
    assert.equal(v.validateRunDate('2026-11-10', today), null);
  });
  it('accepts exactly 62 days ago but not 63', () => {
    assert.equal(v.validateRunDate('2026-09-15', today), null);
    assert.match(v.validateRunDate('2026-09-14', today), /too old/);
  });
  it('rejects future dates', () => {
    assert.match(v.validateRunDate('2026-11-17', today), /future/);
  });
  it('rejects impossible or badly formatted dates', () => {
    for (const s of ['2026-02-30', '16/11/2026', '', undefined]) {
      assert.match(v.validateRunDate(s, today), /Invalid run date/, String(s));
    }
  });
});

describe('validation: image', () => {
  it('detects JPG and PNG by magic bytes', () => {
    assert.equal(v.validateImage(JPG).ext, 'jpg');
    assert.equal(v.validateImage(PNG).ext, 'png');
    assert.equal(v.validateImage(PNG).contentType, 'image/png');
  });
  it('ignores a misleading name: only content matters', () => {
    assert.equal(v.detectImage(Buffer.from('GIF89a-not-allowed')), null);
    assert.equal(v.detectImage(Buffer.from('<?php echo 1; ?>')), null);
  });
  it('rejects empty, wrong type and oversized files', () => {
    assert.equal(v.validateImage(Buffer.alloc(0)).error, 'No image selected');
    assert.match(v.validateImage(Buffer.from('GIF89a-not-allowed')).error, /JPG or PNG/);
    const big = Buffer.concat([JPG, Buffer.alloc(v.MAX_IMAGE_BYTES)]);
    assert.match(v.validateImage(big).error, /5MB/);
  });
});

describe('validation: month and Vietnam date', () => {
  it('validates yyyy-mm months', () => {
    assert.ok(v.isValidMonth('2026-11'));
    assert.ok(!v.isValidMonth('2026-13'));
    assert.ok(!v.isValidMonth('2026-00'));
    assert.ok(!v.isValidMonth('26-11'));
  });
  it('todayVN uses UTC+7 (2026-11-15 18:00 UTC is already 2026-11-16 in Vietnam)', () => {
    assert.equal(v.todayVN(Date.UTC(2026, 10, 15, 18, 0)), '2026-11-16');
    assert.equal(v.todayVN(Date.UTC(2026, 10, 15, 16, 59)), '2026-11-15');
    assert.equal(v.currentMonthVN(Date.UTC(2026, 11, 31, 18, 0)), '2027-01');
  });
});
