'use strict';

const express = require('express');
const ContactService = require('../services/ContactService');
const MergeService = require('../services/MergeService');
const { requireAuth } = require('../middleware');

const router = express.Router();
router.use(requireAuth);

router.get('/', (req, res) => {
  return res.json({ contacts: ContactService.list({ q: req.query.q, tag: req.query.tag }), variables: MergeService.BUILTIN });
});

router.post('/', (req, res, next) => {
  try {
    const contact = ContactService.create(req.body || {});
    return res.status(201).json({ contact });
  } catch (err) {
    return next(err);
  }
});

router.post('/import', (req, res, next) => {
  try {
    const csv = String((req.body || {}).csv || '');
    return res.json(ContactService.importCsv(csv));
  } catch (err) {
    return next(err);
  }
});

router.get('/export', (req, res) => {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="contacts.csv"');
  return res.send(ContactService.exportCsv());
});

router.get('/:id', (req, res) => {
  const contact = ContactService.get(req.params.id);
  if (!contact) return res.status(404).json({ error: 'Contact not found' });
  return res.json({ contact });
});

router.put('/:id', (req, res, next) => {
  try {
    const contact = ContactService.update(req.params.id, req.body || {});
    if (!contact) return res.status(404).json({ error: 'Contact not found' });
    return res.json({ contact });
  } catch (err) {
    return next(err);
  }
});

router.delete('/:id', (req, res) => {
  const ok = ContactService.remove(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Contact not found' });
  return res.json({ ok: true });
});

router.post('/preview', (req, res) => {
  const body = req.body || {};
  const contact = body.contactId ? ContactService.get(body.contactId) : null;
  const vars = Object.assign({}, MergeService.contactVars(contact), body.variables || {});
  return res.json({
    html: MergeService.applyMerge(String(body.html || ''), vars, body.fallbacks),
    variables: vars,
  });
});

module.exports = router;
