'use strict';

const router = require('express').Router();
const { version } = require('../../package.json');

router.get('/', (req, res) => {
  res.json({ ok: true, name: 'email-studio', version });
});

module.exports = router;
