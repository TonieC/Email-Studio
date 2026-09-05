'use strict';

function parseJson(value, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch (_) {
    return fallback;
  }
}

function parseTags(value) {
  const arr = parseJson(value, []);
  if (!Array.isArray(arr)) return [];
  return arr.map((t) => String(t).trim()).filter(Boolean).slice(0, 40);
}

function parseFields(value) {
  const obj = parseJson(value, {});
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return {};
  const out = {};
  for (const [k, v] of Object.entries(obj).slice(0, 40)) {
    const key = String(k).trim().slice(0, 40);
    if (!key) continue;
    out[key] = String(v == null ? '' : v).slice(0, 500);
  }
  return out;
}

function clampStr(v, max) {
  return String(v == null ? '' : v).slice(0, max);
}

function now() {
  return Date.now();
}

module.exports = { parseJson, parseTags, parseFields, clampStr, now };
