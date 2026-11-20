'use strict';
const express = require('express');
const { notFound, errorHandler } = require('./middlewares/errorHandler');
const { createAdminApiController } = require('./controllers/adminApiController');
const { createApiController } = require('./controllers/apiController');
const { createJwt } = require('./middlewares/jwt');
const { requireGateway } = require('./middlewares/gateway');

function createApp(deps) {
  const { cfg, authService, runService, auditService } = deps;
  const { signToken, requireAuth, requireAdminApi } = createJwt({ cfg });
  const app = express();
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });

  // Unset (local dev) = no check; set in Azure = only APIM can call the API.
  if (cfg.gatewaySecret) app.use(requireGateway(cfg.gatewaySecret));

  const adminApiController = createAdminApiController({ runService, auditService });
  const apiController = createApiController({ cfg, runService, authService, signToken, requireAuth });

  app.use(require('./routes/api')({ apiController, adminApiController, requireAuth, requireAdminApi }));

  app.use(notFound);
  app.use(errorHandler);
  return app;
}

module.exports = { createApp };
