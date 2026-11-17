'use strict';
const path = require('node:path');
const express = require('express');
const session = require('express-session');
const { csrfToken } = require('./middlewares/csrf');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { createAuthController } = require('./controllers/authController');
const { createRunController } = require('./controllers/runController');
const { createAdminController } = require('./controllers/adminController');
const { createApiController } = require('./controllers/apiController');
const { createJwt } = require('./middlewares/jwt');

function createApp(deps) {
  const { cfg, authService, runService, auditService } = deps;
  const { signToken, requireAuth } = createJwt({ cfg });
  const app = express();
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/static', express.static(path.join(__dirname, '..', 'public'), { maxAge: '1h' }));
  app.use(express.urlencoded({ extended: false, limit: '20kb' }));
  // MemoryStore is fine for a single instance (F1/B1). With several instances switch to an external store.
  app.use(session({
    name: 'krtrun.sid',
    secret: cfg.sessionSecret,
    resave: false,
    saveUninitialized: true,
    cookie: { httpOnly: true, sameSite: 'lax', secure: cfg.isProd ? 'auto' : false, maxAge: 60 * 60 * 1000 },
  }));
  app.use((req, res, next) => {
    res.locals.user = req.session.user || null;
    res.locals.csrf = csrfToken(req);
    res.locals.appEnv = cfg.appEnv;
    next();
  });

  const authController = createAuthController({ authService });
  const runController = createRunController({ runService });
  const adminController = createAdminController({ runService, auditService });
  const apiController = createApiController({ cfg, runService, authService, signToken, requireAuth });

  app.use(require('./routes/api')({ apiController, requireAuth }));
  app.use(require('./routes/auth')({ authController }));
  app.use(require('./routes/runs')({ runController }));
  app.use(require('./routes/admin')({ adminController }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
