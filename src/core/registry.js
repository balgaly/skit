'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { resolveSkitHome } = require('../index');

const REGISTRY_URL = 'https://raw.githubusercontent.com/balgaly/skit-registry/main/index.json';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
const ANSI_RE = /[\u001b\u009b][[()#;?]*(?:[0-9]{1,4}(?:;[0-9]{0,4})*)?[0-9A-ORZcf-nqry=><~]/g;
const EMPTY_RESULT = { version: 1, updated: '', entries: [] };

function stripAnsi(str) {
  if (typeof str !== 'string') return str;
  return str.replace(ANSI_RE, '');
}

function validateRegistryUrl(url) {
  if (!url || typeof url !== 'string') return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' && parsed.hostname === 'github.com';
  } catch {
    return false;
  }
}

function readCache(skitHome) {
  const cacheFile = path.join(skitHome, 'registry-cache.json');
  try {
    const raw = fs.readFileSync(cacheFile, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function writeCache(skitHome, data) {
  fs.mkdirSync(skitHome, { recursive: true });
  const cacheFile = path.join(skitHome, 'registry-cache.json');
  fs.writeFileSync(cacheFile, JSON.stringify({ fetchedAt: Date.now(), data }, null, 2), 'utf-8');
}

function sanitizeEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .filter((e) => e && validateRegistryUrl(e.url))
    .map((e) => ({
      ...e,
      name: stripAnsi(String(e.name || '')),
      description: stripAnsi(String(e.description || '')),
      tags: Array.isArray(e.tags) ? e.tags.map((t) => stripAnsi(String(t))) : [],
    }));
}

async function fetchRegistry(options = {}) {
  const skitHome = options.skitHome || resolveSkitHome();
  const fetchFn = options._fetch || globalThis.fetch;

  const cache = readCache(skitHome);
  const now = Date.now();
  if (cache && (now - cache.fetchedAt) < CACHE_TTL_MS) {
    const data = cache.data || EMPTY_RESULT;
    return { ...data, entries: sanitizeEntries(data.entries) };
  }

  try {
    const res = await fetchFn(REGISTRY_URL);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    try {
      writeCache(skitHome, data);
    } catch {
      console.warn('skit: failed to write registry cache');
    }
    return { ...data, entries: sanitizeEntries(data.entries) };
  } catch (err) {
    if (cache && cache.data) {
      const data = cache.data;
      return { ...data, entries: sanitizeEntries(data.entries) };
    }
    return { ...EMPTY_RESULT };
  }
}

function invalidateCache(skitHome) {
  const cacheFile = path.join(skitHome, 'registry-cache.json');
  try {
    fs.unlinkSync(cacheFile);
  } catch {
    // already gone
  }
}

module.exports = { fetchRegistry, validateRegistryUrl, stripAnsi, invalidateCache };
