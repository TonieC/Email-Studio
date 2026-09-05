'use strict';

const express = require('express');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

const SPEC = {
  title: 'Email Studio REST API',
  auth: 'Session cookie + CSRF, or Authorization: Bearer es_... API key (CSRF skipped for API keys).',
  rateLimit: '120 REST requests/min for /api/v1; 30 sends/hour.',
  endpoints: [
    { method: 'GET', path: '/api/v1/projects', desc: 'List projects' },
    { method: 'POST', path: '/api/v1/projects', desc: 'Create project' },
    { method: 'GET', path: '/api/v1/projects/:id', desc: 'Get project' },
    { method: 'PUT', path: '/api/v1/projects/:id', desc: 'Update project' },
    { method: 'DELETE', path: '/api/v1/projects/:id', desc: 'Delete project' },
    { method: 'GET', path: '/api/v1/templates', desc: 'List templates' },
    { method: 'GET', path: '/api/v1/assets', desc: 'List assets' },
    { method: 'POST', path: '/api/v1/convert', desc: 'Convert HTML/CSS' },
    { method: 'POST', path: '/api/v1/compatibility', desc: 'Analyze compatibility' },
    { method: 'GET', path: '/api/v1/accounts', desc: 'List sending accounts' },
    { method: 'POST', path: '/api/v1/send', desc: 'Send an email' },
    { method: 'GET', path: '/api/v1/history', desc: 'Send history' },
  ],
};

router.get('/', (req, res) => res.json(SPEC));

module.exports = router;
