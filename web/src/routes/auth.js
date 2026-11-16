'use strict';
const express = require('express');
const { verifyCsrf } = require('../middlewares/csrf');

module.exports = function authRoutes({ authController }) {
  const r = express.Router();
  r.get('/login', authController.showLogin);
  r.post('/login', verifyCsrf, authController.login);
  r.get('/register', authController.showRegister);
  r.post('/register', verifyCsrf, authController.register);
  r.post('/logout', verifyCsrf, authController.logout);
  return r;
};
