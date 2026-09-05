'use strict';

const express = require('express');
const session = require('express-session');
const helmet = require('helmet');
const path = require('path');
const config = require('./src/config');
const SQLiteSessionStore = require('./src/session-store');
const TemplateService = require('./src/services/TemplateService');
const ScheduleService = require('./src/services/ScheduleService');
const { ensureCsrfToken, csrfProtect, apiLimiter, notFound, errorHandler } = require('./src/middleware');

const app = express();
app.set('trust proxy', config.trustProxy ? 1 : 0);

// Security headers (relaxed to allow self-hosted HTTP and inline styles for the editor)
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'blob:', 'http:', 'https:'],
      fontSrc: ["'self'", 'data:'],
      connectSrc: ["'self'"],
      frameAncestors: ["'self'"],
      objectSrc: ["'none'"],
      baseUri: ["'self'"],
      formAction: ["'self'"],
      upgradeInsecureRequests: null,
    },
  },
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginEmbedderPolicy: false,
}));

app.use(express.json({ limit: '4mb' }));
app.use(express.urlencoded({ extended: false, limit: '1mb' }));

app.use(session({
  name: 'emailstudio.sid',
  secret: config.sessionSecret,
  store: new SQLiteSessionStore(),
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: config.cookieSecure,
    sameSite: 'lax',
    maxAge: config.sessionTtlMs,
  },
}));

app.use(ensureCsrfToken);
app.use(apiLimiter());
app.use(csrfProtect);

// Static assets and SPA shell
app.use(express.static(path.join(__dirname, 'public'), {
  index: 'index.html',
  maxAge: 0,
  setHeaders: (res, filePath) => {
    if (filePath.endsWith('app.js') || filePath.endsWith('app.css')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

// API routes
app.use('/api/health', require('./src/routes/health'));
app.use('/api/auth', require('./src/routes/auth'));
app.use('/api/projects', require('./src/routes/projects'));
app.use('/api/convert', require('./src/routes/convert'));
app.use('/api/send', require('./src/routes/send'));
app.use('/api/accounts', require('./src/routes/accounts'));
app.use('/api/assets', require('./src/routes/assets'));
app.use('/api/templates', require('./src/routes/templates'));
app.use('/api/history', require('./src/routes/history'));
app.use('/api/settings', require('./src/routes/settings'));
app.use('/api/folders', require('./src/routes/folders'));
app.use('/api/blocks', require('./src/routes/blocks'));
app.use('/api/contacts', require('./src/routes/contacts'));
app.use('/api/schedule', require('./src/routes/schedule'));
app.use('/api/links', require('./src/routes/links'));
app.use('/api/webhooks', require('./src/routes/webhooks'));
app.use('/api/keys', require('./src/routes/keys'));
app.use('/api/format', require('./src/routes/format'));
app.use('/api/docs', require('./src/routes/docs'));
app.use('/api/v1', require('./src/routes/v1'));
app.use('/', require('./src/routes/oauth'));

// SPA fallback for non-API routes
app.get('*', (req, res, next) => {
  if (req.path.startsWith('/api/')) return next();
  return res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.use(notFound);
app.use(errorHandler);

TemplateService.seed();

function start(port = config.port) {
  const server = app.listen(port, () => {
    console.log(`[email-studio] listening on http://0.0.0.0:${port}`);
    console.log(`[email-studio] data directory: ${config.dataDir}`);
  });

  // Graceful shutdown
  function shutdown() {
    server.close(() => process.exit(0));
  }
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);

  return server;
}

if (require.main === module) {
  ScheduleService.start();
  start();
}

module.exports = { app, start, config };
