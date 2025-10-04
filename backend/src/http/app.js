const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const crypto = require('crypto');

const config = require('../config/env');
const logger = require('../logging/logger');
const createRoutes = require('./routes');
const { metricsMiddleware, exposeMetrics } = require('../observability/metrics');

const createApp = (dependencies) => {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1);

  app.use((req, res, next) => {
    const requestId = req.header('x-request-id') || crypto.randomUUID();
    req.id = requestId;
    res.locals.requestId = requestId;
    res.setHeader('X-Request-Id', requestId);

    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info('HTTP response', {
        requestId,
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        durationMs: duration,
      });
    });
    next();
  });

  app.use(metricsMiddleware);

  app.use(helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'", 'http:', 'https:', 'ws:', 'wss:'],
      },
    },
    crossOriginResourcePolicy: { policy: 'same-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  }));

  app.use(cors({
    origin: config.allowedOrigins,
    credentials: true,
  }));

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true, limit: '1mb' }));
  app.use(compression({ threshold: 1024 }));

  app.use(rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 400,
    standardHeaders: true,
    legacyHeaders: false,
  }));

  app.use('/api', createRoutes(dependencies));

  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  if (config.metrics?.enabled) {
    app.get('/metrics', (req, res, next) => {
      if (config.metrics.token) {
        const provided = req.header('authorization');
        const expected = `Bearer ${config.metrics.token}`;
        if (provided !== expected) {
          return res.status(401).send('unauthorized');
        }
      }
      exposeMetrics(req, res, next);
    });
  }

  app.use((err, req, res, next) => {
    logger.error('Unhandled error', {
      requestId: req.id,
      message: err.message,
      stack: err.stack,
    });
    res.status(err.status || 500).json({ error: err.message || 'Internal Server Error' });
  });

  return app;
};

module.exports = createApp;
