'use strict';
const bcrypt = require('bcryptjs');
const v = require('./validation');

const ROUNDS = 10;
const hashPassword = (plain) => bcrypt.hash(plain, ROUNDS);
const verifyPassword = (plain, hash) => (hash ? bcrypt.compare(plain, hash) : Promise.resolve(false));

function createAuthService({ cfg, users, audit }) {
  return {
    async login({ employeeCode, password, clientIp }) {
      const code = String(employeeCode || '').trim();
      const user = v.isValidEmployeeCode(code) ? await users.get(code) : null;
      const ok = user && (await verifyPassword(String(password || ''), user.passwordHash));
      if (!ok) {
        await audit.append({ action: 'LOGIN', actor: code.slice(0, 20), result: 'FAILED', clientIp });
        return { ok: false, error: 'Wrong employee code or password', code };
      }
      return {
        ok: true,
        sessionUser: { code: user.rowKey, fullName: user.fullName, role: user.role },
        code,
        clientIp,
      };
    },

    async recordLoginSuccess({ code, clientIp }) {
      await audit.append({ action: 'LOGIN', actor: code, clientIp }).catch(() => {});
    },

    async register({ employeeCode, fullName, password, password2, clientIp }) {
      const form = {
        employeeCode: String(employeeCode || '').trim(),
        fullName: String(fullName || '').trim().slice(0, 80),
      };
      if (!v.isValidEmployeeCode(form.employeeCode)) {
        return { ok: false, error: 'Employee code must be 3-20 characters (letters, digits, - or _)', form };
      }
      if (!form.fullName) return { ok: false, error: 'Please enter your full name', form };
      if (!v.isValidPassword(password)) return { ok: false, error: 'Password must be 8 to 72 characters', form };
      if (password !== password2) return { ok: false, error: 'Passwords do not match', form };

      const role = cfg.adminCode && form.employeeCode === cfg.adminCode ? 'admin' : 'user';
      try {
        await users.create({
          code: form.employeeCode,
          fullName: form.fullName,
          passwordHash: await hashPassword(password),
          role,
        });
      } catch (e) {
        if (e.statusCode === 409) return { ok: false, error: 'Employee code is already registered', form };
        throw e;
      }
      await audit.append({
        action: 'REGISTER', actor: form.employeeCode, detail: `role=${role}`, clientIp,
      });
      return { ok: true };
    },
  };
}

module.exports = { createAuthService, hashPassword, verifyPassword };
